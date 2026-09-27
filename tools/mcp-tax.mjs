#!/usr/bin/env node
// Start-of-session token tax of an MCP server. Tool schemas sit in the system-prompt prefix of
// every session and are paid whether or not a tool is ever called. Method: run one trivial
// prompt with no MCP server (baseline) and once per server; the difference in billed input
// (input + cache write + cache read) is the weight of that server's schemas. The stream's
// `system` init event lists the tools, so the tool count is logged as well.
//
//   node tools/mcp-tax.mjs [--model claude-haiku-4-5-20251001]

import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const MODEL = argv.includes("--model") ? argv[argv.indexOf("--model") + 1] : "claude-haiku-4-5-20251001";
const CLAUDE = process.env.CLAUDE_BIN || "claude";
const PROMPT = "Reply with the single word: ok";
const mcp = (name, command, args = []) => JSON.stringify({ mcpServers: { [name]: { command, args } } });

const CASES = {
  baseline: [],
  "cbm-lean": ["--mcp-config", mcp("cbm", process.execPath, [join(ROOT, "server.mjs")])],
  "codebase-memory-mcp": ["--mcp-config", mcp("cbmraw", process.env.CBM_BIN || "codebase-memory-mcp")],
  playwright: ["--mcp-config", mcp("playwright", "npx", ["-y", "@playwright/mcp@latest"])],
};

const childEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("CLAUDE_")));

async function run(name, flags) {
  const t0 = Date.now();
  let stdout;
  try {
    ({ stdout } = await exec(CLAUDE, ["-p", PROMPT, "--output-format", "stream-json", "--verbose",
      "--model", MODEL, "--strict-mcp-config", "--setting-sources", "project", "--no-session-persistence",
      "--disallowedTools", "Bash", ...flags],
      { cwd: tmpdir(), env: childEnv, maxBuffer: 64 * 1024 * 1024, timeout: 10 * 60 * 1000 }));
  } catch (err) {
    return { name, error: String(err.message).slice(0, 200) };
  }
  let usage = {};
  let tools = [];
  for (const line of stdout.split("\n")) {
    if (!line.startsWith("{")) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.type === "system" && e.tools) tools = e.tools;
    if (e.type === "result" && e.usage) usage = e.usage;
  }
  const billed = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
  return { name, billed, mcpTools: tools.filter((t) => t.startsWith("mcp__")).length, wallMs: Date.now() - t0 };
}

const out = [];
for (const [name, flags] of Object.entries(CASES)) {
  process.stderr.write(`measuring ${name} ... `);
  const r = await run(name, flags);
  out.push(r);
  process.stderr.write(r.error ? `ERROR ${r.error}\n` : `${r.billed} billed, ${r.mcpTools} MCP tools\n`);
}
const base = out.find((r) => r.name === "baseline")?.billed ?? 0;
console.log(JSON.stringify({ model: MODEL, baseline: base,
  cases: out.map((r) => ({ ...r, taxTokens: r.billed != null ? r.billed - base : null })) }, null, 2));
