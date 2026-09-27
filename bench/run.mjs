#!/usr/bin/env node
// Does a code-graph MCP server make a coding agent cheaper or more accurate than plain
// Read/Grep/Glob? Every question in questions.json goes through `claude -p` under three arms,
// and each run records billed tokens, turns, which tools it called and whether the answer holds
// the facts it must contain.
//
//   node bench/run.mjs --model claude-haiku-4-5-20251001 --reps 3
//   node bench/run.mjs --only graph --ids callers,route-scan --reps 1
//   node bench/run.mjs --arms graph-unguided --reps 1
//
// Arms. All of them pass --strict-mcp-config, so MCP servers from the user's config never leak in.
//   graph           this repo's server.mjs (cbm-lean) plus Read, Grep, Glob, with the routing rule
//   rawgraph        the codebase-memory-mcp binary mounted directly, same tools, same rule
//   nograph         Read, Grep, Glob only
//   graph-unguided  like graph, without the rule (not run by default)
//
// Controls, each added because its absence produced a wrong conclusion in an earlier round:
//   - Bash and Agent are denied everywhere. Scoped Bash grants do not match piped commands, which
//     gave the arms different numbers of permission denials; and num_turns counts only the main
//     loop, so an arm that delegates to subagents hides turns while still paying for them.
//   - --setting-sources project skips user-level hooks, plugins and settings, so nothing from the
//     machine that runs the benchmark tells the model which tools to prefer.
//   - Arm order rotates per rep: back-to-back runs on the same repo share a prompt cache, and a
//     fixed order would hand the later arms a systematic discount.
//   - tokenEquiv prices each token class at its multiplier (input 1, cache write 1.25, cache read
//     0.1, output counted separately), so a run is not "cheap" just because it ran on a warm cache.
//   - A run that calls an MCP tool its arm does not own is marked invalid instead of averaged in.
//   - Answers are kept. Tokens saved on a wrong answer are not savings.

import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const MODEL = arg("model", "claude-haiku-4-5-20251001");
const REPS = Number(arg("reps", 3));
const ONLY = arg("only", null);
const IDS = arg("ids", null)?.split(",");
const CLAUDE = process.env.CLAUDE_BIN || "claude";
const CBM = process.env.CBM_BIN || "codebase-memory-mcp";
const BENCH_DIR = process.env.CBM_BENCH_DIR || join(homedir(), "cbm-bench", "repos");
const OUT = arg("out", join(ROOT, "results", `${MODEL}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "")}.json`));

const spec = JSON.parse(readFileSync(join(HERE, "questions.json"), "utf8"));
const QUESTIONS = spec.questions.filter((q) => !IDS || IDS.includes(q.id));

const TOOLS = ["Read", "Grep", "Glob"];
const COMMON = ["--strict-mcp-config", "--setting-sources", "project", "--no-session-persistence",
  "--disallowedTools", "Bash", "Agent"];
const mcp = (name, command, args = []) => JSON.stringify({ mcpServers: { [name]: { command, args } } });
// Mounting a graph is not enough: in a pilot with no instructions, haiku never called it (0 graph
// calls in 6 runs) and answered with Grep and Read. In practice the routing rule lives in
// CLAUDE.md, so the graph arms get the same rule as an appended system prompt. The nograph arm
// has nothing to route to and gets nothing. graph-unguided keeps the tools and drops the rule, to
// measure how often the graph is used at all when nobody says when to use it.
const RULE = "For exact strings, config values, flags and error messages, Grep and Read are faster.";
const GRAPH_GUIDE = "This repository is indexed in a code knowledge graph, reachable through the cbm MCP tools. "
  + "For structural questions (who calls a function, what it calls, call chains, HTTP routes, module layout, "
  + "a symbol end to end) use mcp__cbm__graph_ask with the matching kind, in one call; "
  + "mcp__cbm__graph_projects lists the project names. " + RULE;
const RAW_GUIDE = "This repository is indexed in a code knowledge graph, reachable through the cbmraw MCP tools "
  + "(codebase-memory-mcp). For structural questions (who calls a function, what it calls, call chains, "
  + "HTTP routes, module layout, a symbol end to end) use search_graph, trace_path, get_code_snippet, "
  + "get_architecture or query_graph; list_projects gives the project names. " + RULE;
const CBM_LEAN = ["--mcp-config", mcp("cbm", process.execPath, [join(ROOT, "server.mjs")]),
  "--allowedTools", ...TOOLS, "mcp__cbm"];
const ARMS = {
  graph: { flags: [...CBM_LEAN, "--append-system-prompt", GRAPH_GUIDE], owns: ["mcp__cbm__"] },
  rawgraph: {
    flags: ["--mcp-config", mcp("cbmraw", CBM), "--allowedTools", ...TOOLS, "mcp__cbmraw",
      "--append-system-prompt", RAW_GUIDE],
    owns: ["mcp__cbmraw__"],
  },
  nograph: { flags: ["--allowedTools", ...TOOLS], owns: [] },
  "graph-unguided": { flags: CBM_LEAN, owns: ["mcp__cbm__"] },
};
const ARM_LIST = (arg("arms", null)?.split(",") ?? ["graph", "rawgraph", "nograph"]).filter((a) => ARMS[a]);

// The child must not inherit anything from a Claude Code session that happens to launch the
// benchmark (effort level, session ids, messaging sockets).
const childEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("CLAUDE_")));
// Claude Code defers MCP tool schemas behind ToolSearch by default. In the pilot, haiku never
// loaded them and never called the graph, with or without the routing rule, so the main runs load
// every schema up front (ENABLE_TOOL_SEARCH=false), as most MCP clients do. `--tool-search default`
// keeps Claude Code's own behaviour, to measure that effect on its own.
const TOOL_SEARCH = arg("tool-search", "off");
if (TOOL_SEARCH === "off") childEnv.ENABLE_TOOL_SEARCH = "false";
else delete childEnv.ENABLE_TOOL_SEARCH;

// Results are meant to be published, so local paths and cbm project names derived from them are
// rewritten before they are stored.
const HOME = homedir();
const projectPrefix = HOME.replace(/^\//, "").replace(/\//g, "-") + "-";
const scrub = (s) => (s ?? "").split(HOME).join("~").split(projectPrefix).join("");

function parseStream(stdout) {
  const toolCalls = {};
  let result = null;
  for (const line of stdout.split("\n")) {
    if (!line.startsWith("{")) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.type === "assistant") {
      for (const b of e.message?.content ?? []) {
        if (b.type === "tool_use") toolCalls[b.name] = (toolCalls[b.name] ?? 0) + 1;
      }
    }
    if (e.type === "result") result = e;
  }
  if (!result) throw new Error("no result event in the stream");
  return { result, toolCalls };
}

async function runOne(armName, q) {
  const arm = ARMS[armName];
  const cwd = join(BENCH_DIR, spec.repos[q.repo].dir);
  const started = Date.now();
  let stdout;
  try {
    ({ stdout } = await exec(CLAUDE, ["-p", q.prompt, "--output-format", "stream-json", "--verbose",
      "--model", MODEL, ...COMMON, ...arm.flags],
      { cwd, env: childEnv, maxBuffer: 64 * 1024 * 1024, timeout: 15 * 60 * 1000 }));
  } catch (err) {
    return { arm: armName, id: q.id, error: scrub(String(err.message)).slice(0, 400) };
  }
  const { result: r, toolCalls } = parseStream(stdout);
  const u = r.usage ?? {};
  const input = u.input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const answer = r.result ?? "";
  const hay = answer.toLowerCase();
  const missing = q.must.filter((m) => !hay.includes(m.toLowerCase()));
  const leaked = Object.keys(toolCalls).filter((t) => t.startsWith("mcp__") && !arm.owns.some((p) => t.startsWith(p)));
  return {
    arm: armName, id: q.id, kind: q.kind, repo: q.repo, model: MODEL,
    turns: r.num_turns, input, cacheWrite, cacheRead,
    billedInput: input + cacheWrite + cacheRead,
    tokenEquiv: Math.round(input + 1.25 * cacheWrite + 0.1 * cacheRead),
    output: u.output_tokens ?? 0,
    costUsd: r.total_cost_usd,
    correct: missing.length === 0, missing,
    valid: leaked.length === 0, leaked,
    denials: (r.permission_denials ?? []).map((d) => d.tool_name),
    toolCalls, wallMs: Date.now() - started, isError: r.is_error,
    answer: scrub(answer),
  };
}

const version = async (bin, args) => {
  try { return (await exec(bin, args, { env: childEnv })).stdout.trim().split("\n")[0]; } catch { return "unknown"; }
};
const meta = {
  model: MODEL, reps: REPS, arms: ARM_LIST, toolSearch: TOOL_SEARCH, started: new Date().toISOString(),
  claude: await version(CLAUDE, ["--version"]), cbm: await version(CBM, ["--version"]),
  repos: Object.fromEntries(Object.entries(spec.repos).map(([n, r]) => [n, `${r.url}@${r.commit.slice(0, 12)}`])),
};
mkdirSync(dirname(OUT), { recursive: true });
const runs = [];
const armNames = ARM_LIST.filter((a) => !ONLY || a === ONLY);
for (let rep = 1; rep <= REPS; rep++) {
  for (const q of QUESTIONS) {
    const order = armNames.map((_, i) => armNames[(i + rep - 1) % armNames.length]);
    for (const arm of order) {
      process.stderr.write(`[rep ${rep}] ${arm.padEnd(8)} ${q.id.padEnd(14)} `);
      const r = { ...(await runOne(arm, q)), rep };
      runs.push(r);
      writeFileSync(OUT, JSON.stringify({ meta, runs }, null, 2));
      process.stderr.write(r.error ? `ERROR ${r.error.slice(0, 120)}\n`
        : `${String(r.tokenEquiv).padStart(7)} teq  ${r.turns} turns  $${(r.costUsd ?? 0).toFixed(4)}  `
          + `${r.correct ? "ok" : "WRONG " + r.missing.join(",")}${r.valid ? "" : "  LEAK " + r.leaked.join(",")}\n`);
    }
  }
}
process.stderr.write(`\nresults: ${OUT}\n`);
