#!/usr/bin/env node
// Benchmark v2 driver (see PLAN-v2.md). Every question in a questions file goes through GitHub Copilot CLI in
// headless mode under two arms: graph (Copilot's read and search tools plus the cbm-lean MCP server and one
// routing sentence) and grep (the read and search tools only).
//
//   node bench/run-copilot.mjs --questions bench/questions-v2.json --model claude-haiku-4.5 --reps 3
//   node bench/run-copilot.mjs --model claude-opus-5.5 --ids k8s-impact-1,vscode-callers-2 --reps 1
//   options: --arms graph,grep  --ids a,b  --parallel 2  --budget 800  --out results/x.json
//
// Measured per run:
//   - tokens from Copilot's debug log, one usage block per model call (prompt, cached, cache-creation and
//     completion tokens), summed over the run, and the same tokenEquiv as v1:
//     uncached input + 1.25 * cache writes + 0.1 * cache reads;
//   - premium requests from the result event (the model's multiplier per prompt, whatever the tool calls);
//   - correctness: every `must` entry has to appear in the final answer as a whole word, case-insensitively
//     (v1 matched substrings, which let "init_db" stand in for "init").
// Arm order rotates per repetition, as in v1: back-to-back runs on one repository share a prompt cache.
// A run that calls an MCP tool its arm does not own is marked invalid.
// Premium requests are added to results/v2-ledger.json, and no run starts once the ledger reaches --budget.

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
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
const MODEL = arg("model", "claude-haiku-4.5");
const REPS = Number(arg("reps", 3));
const IDS = arg("ids", null)?.split(",");
const PARALLEL = Number(arg("parallel", 1));
const BUDGET = Number(arg("budget", 800));
const COPILOT = process.env.COPILOT_BIN || "copilot";
const CBM = process.env.CBM_BIN || "codebase-memory-mcp";
const BENCH_DIR = process.env.CBM_BENCH_DIR || join(homedir(), "cbm-bench", "repos");
const OUT = arg("out", join(ROOT, "results", "v2", `${MODEL}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "")}.json`));
const LEDGER = join(ROOT, "results", "v2-ledger.json");
// Premium requests per prompt, measured in the pilot (2026-10-01).
const FAILED_LOGS = join(tmpdir(), "copilot-bench-failed");
const MULTIPLIER = { "claude-haiku-4.5": 0.33, "claude-sonnet-5": 1, "claude-opus-5.5": 15 };

const QUESTIONS_FILE = arg("questions", join(HERE, "questions-v2.json"));
const spec = JSON.parse(readFileSync(QUESTIONS_FILE, "utf8"));
const QUESTIONS = spec.questions.filter((q) => !IDS || IDS.includes(q.id));

const READ_TOOLS = ["view", "grep", "glob"];
// graph_index is left out: every repository is indexed before the run.
const CBM_TOOLS = ["graph_ask", "graph_cypher", "graph_snippet", "graph_find", "graph_trace", "graph_arch",
  "graph_schema", "graph_changes", "graph_grep", "graph_projects"].map((t) => `cbm-${t}`);
const RULE = "For exact strings, config values, flags and error messages, grep and view are faster.";
const GUIDE = "This repository is indexed in a code knowledge graph, reachable through the cbm MCP tools. "
  + "For structural questions (who calls a function, what it calls, call chains, HTTP routes, module layout, "
  + "a symbol end to end) use the graph_ask tool with the matching kind, in one call; "
  + "graph_projects lists the project names. " + RULE;
const MCP = JSON.stringify({ mcpServers: { cbm: { type: "local", command: process.execPath, args: [join(ROOT, "server.mjs")], tools: ["*"] } } });
const COMMON = ["--allow-all-tools", "--disable-builtin-mcps", "--output-format", "json", "-s", "--log-level", "debug"];
const ARMS = {
  graph: { flags: ["--additional-mcp-config", MCP, "--available-tools", ...READ_TOOLS, ...CBM_TOOLS], prefix: GUIDE + "\n\n", owns: ["cbm-"] },
  grep: { flags: ["--available-tools", ...READ_TOOLS], prefix: "", owns: [] },
};
const ARM_LIST = (arg("arms", null)?.split(",") ?? ["graph", "grep"]).filter((a) => ARMS[a]);

// Copilot keeps its own login. GitHub tokens in this shell would take precedence over it, so the child
// does not get them, nor anything from a Claude Code session that launched the benchmark.
const childEnv = Object.fromEntries(Object.entries(process.env)
  .filter(([k]) => !k.startsWith("CLAUDE_") && !["GH_TOKEN", "GITHUB_TOKEN", "COPILOT_GITHUB_TOKEN"].includes(k)));

// Results are published, so local paths and cbm project names derived from them are rewritten.
const HOME = homedir();
const projectPrefix = HOME.replace(/^\//, "").replace(/\//g, "-") + "-";
const scrub = (s) => (s ?? "").split(HOME).join("~").split(projectPrefix).join("");

function usageFromLog(dir) {
  // One usage block per model call, OpenAI-shaped:
  //   "usage": {"prompt_tokens": …, "completion_tokens": …, "prompt_tokens_details":
  //             {"cached_tokens": …, "cache_creation_tokens": …}}
  // prompt_tokens includes the cached and the cache-creation tokens.
  const calls = [];
  const num = (block, field) => Number(new RegExp(`"${field}":\\s*(\\d+)`).exec(block)?.[1] ?? 0);
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".log")) continue;
    const text = readFileSync(join(dir, f), "utf8");
    for (const m of text.matchAll(/"usage":\s*\{/g)) {
      const block = text.slice(m.index, m.index + 800);
      if (!/"prompt_tokens":/.test(block)) continue;
      calls.push({ prompt: num(block, "prompt_tokens"), completion: num(block, "completion_tokens"),
        cached: num(block, "cached_tokens"), created: num(block, "cache_creation_tokens") });
    }
  }
  return calls;
}

function parseEvents(stdout) {
  const toolCalls = {};
  let result = null;
  let answer = "";
  for (const line of stdout.split("\n")) {
    if (!line.startsWith("{")) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.type === "tool.execution_start" && e.data?.toolName) toolCalls[e.data.toolName] = (toolCalls[e.data.toolName] ?? 0) + 1;
    if (e.type === "assistant.message" && typeof e.data?.content === "string" && e.data.content.trim()) answer = e.data.content;
    if (e.type === "result") result = e;
  }
  if (!result) throw new Error("no result event in the stream");
  return { result, toolCalls, answer };
}

const ledger = () => (existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, "utf8")) : { premiumRequests: 0, runs: 0 });
function charge(premium) {
  const l = ledger();
  l.premiumRequests = Math.round((l.premiumRequests + premium) * 100) / 100;
  l.runs += 1;
  writeFileSync(LEDGER, JSON.stringify(l, null, 2) + "\n");
  return l.premiumRequests;
}

async function runOne(armName, q) {
  const arm = ARMS[armName];
  const cwd = join(BENCH_DIR, spec.repos[q.repo].dir);
  const logDir = mkdtempSync(join(tmpdir(), "copilot-bench-"));
  const started = Date.now();
  let stdout;
  try {
    ({ stdout } = await exec(COPILOT, ["-p", arm.prefix + q.prompt, "--model", MODEL, ...COMMON, "--log-dir", logDir, ...arm.flags],
      { cwd, env: childEnv, maxBuffer: 64 * 1024 * 1024, timeout: 15 * 60 * 1000 }));
  } catch (err) {
    // Keep the failed session's log for diagnosis, outside the repository (it is not scrubbed).
    const kept = join(FAILED_LOGS, `${MODEL}-${q.id}-${armName}-${started}`);
    try { mkdirSync(FAILED_LOGS, { recursive: true }); renameSync(logDir, kept); } catch { rmSync(logDir, { recursive: true, force: true }); }
    const tail = (text) => scrub(String(text ?? "")).trim().slice(-600);
    // A failed run was still charged; book the model's multiplier so the budget stays conservative.
    return { arm: armName, id: q.id, kind: q.kind, repo: q.repo, model: MODEL, ledger: charge(MULTIPLIER[MODEL] ?? 1),
      error: tail(err.stderr) || scrub(String(err.message)).slice(0, 400), exitCode: err.code ?? null,
      signal: err.signal ?? null, killed: Boolean(err.killed), wallMs: Date.now() - started, stdoutTail: tail(err.stdout) };
  }
  const { result, toolCalls, answer } = parseEvents(stdout);
  const calls = usageFromLog(logDir);
  rmSync(logDir, { recursive: true, force: true });
  const sum = (k) => calls.reduce((a, c) => a + c[k], 0);
  const prompt = sum("prompt"), cacheRead = sum("cached"), cacheWrite = sum("created"), completion = sum("completion");
  const input = prompt - cacheRead - cacheWrite;
  // Whole-word match: "init" must not be satisfied by "init_db", nor "test_email" by "generate_test_email".
  const word = (m) => new RegExp(`(^|[^A-Za-z0-9_])${m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^A-Za-z0-9_])`, "i");
  const missing = q.must.filter((m) => !word(m).test(answer));
  const leaked = Object.keys(toolCalls).filter((t) => t.startsWith("cbm-") && !arm.owns.some((p) => t.startsWith(p)));
  const premium = result.usage?.premiumRequests ?? 0;
  return {
    arm: armName, id: q.id, kind: q.kind, repo: q.repo, model: MODEL,
    modelCalls: calls.length, input, cacheWrite, cacheRead, output: completion,
    firstCallPrompt: calls[0]?.prompt ?? null,
    tokenEquiv: Math.round(input + 1.25 * cacheWrite + 0.1 * cacheRead),
    premiumRequests: premium, ledger: charge(premium),
    correct: missing.length === 0, missing,
    valid: leaked.length === 0, leaked,
    toolCalls, wallMs: Date.now() - started, apiMs: result.usage?.totalApiDurationMs ?? null,
    exitCode: result.exitCode,
    answer: scrub(answer),
  };
}

const version = async (bin, args) => {
  try { return (await exec(bin, args, { env: childEnv })).stdout.trim().split("\n")[0]; } catch { return "unknown"; }
};
const meta = {
  model: MODEL, reps: REPS, arms: ARM_LIST, questions: QUESTIONS_FILE.split("/").pop(), parallel: PARALLEL,
  started: new Date().toISOString(),
  copilot: await version(COPILOT, ["--version"]), cbm: await version(CBM, ["--version"]),
  repos: Object.fromEntries(Object.entries(spec.repos).map(([n, r]) => [n, `${r.url}@${r.commit.slice(0, 12)}`])),
};
mkdirSync(dirname(OUT), { recursive: true });

const jobs = [];
for (let rep = 1; rep <= REPS; rep++) {
  for (const q of QUESTIONS) {
    const order = ARM_LIST.map((_, i) => ARM_LIST[(i + rep - 1) % ARM_LIST.length]);
    for (const arm of order) jobs.push({ rep, q, arm });
  }
}
const runs = [];
let stopped = false;
async function worker() {
  while (jobs.length && !stopped) {
    if (ledger().premiumRequests >= BUDGET) { stopped = true; process.stderr.write(`budget of ${BUDGET} premium requests reached, stopping\n`); break; }
    const { rep, q, arm } = jobs.shift();
    const r = { ...(await runOne(arm, q)), rep };
    runs.push(r);
    writeFileSync(OUT, JSON.stringify({ meta, runs }, null, 2));
    process.stderr.write(`[rep ${rep}] ${arm.padEnd(5)} ${q.id.padEnd(22)} ` + (r.error ? `ERROR ${r.error.slice(0, 120)}\n`
      : `${String(r.tokenEquiv).padStart(7)} teq  ${r.modelCalls} calls  ${r.premiumRequests} PR (ledger ${r.ledger})  `
        + `${r.correct ? "ok" : "WRONG " + r.missing.join(",")}${r.valid ? "" : "  LEAK " + r.leaked.join(",")}\n`));
  }
}
await Promise.all(Array.from({ length: PARALLEL }, worker));
process.stderr.write(`\nresults: ${OUT}\n`);
