#!/usr/bin/env node
// Backlog #1 — audit the biggest token lever in REAL sessions, not the benchmark.
// Prompt caching is 83–88% of billed input in the controlled runs; this checks
// whether production Claude Code sessions actually hit cache, or whether something
// (a datetime in a system prompt, a shifting tool set, unsorted JSON) is silently
// invalidating the prefix and paying full freight.
//
// Reads ~/.claude/projects/**/*.jsonl, sums per-assistant-turn usage, and reports
// the cache-read fraction of billed input overall, per project, and the worst
// sessions — a low fraction is money left on the table.
//
//   node cache-audit.mjs [--days 7] [--min-turns 5]

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const DAYS = Number(arg("days", 7));
const MIN_TURNS = Number(arg("min-turns", 5));
const ROOT = join(homedir(), ".claude", "projects");
// Claude Code names each project directory after its absolute path with "/" turned into "-".
const HOME_SLUG = homedir().replace(/\//g, "-");
const cutoff = Date.now() - DAYS * 86400_000;

function* jsonl(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* jsonl(p);
    else if (e.name.endsWith(".jsonl") && statSync(p).mtimeMs >= cutoff) yield p;
  }
}

const proj = {};      // project -> totals
const sessions = [];  // per-file summary

for (const f of jsonl(ROOT)) {
  let read = 0, create = 0, fresh = 0, out = 0, turns = 0;
  const perTurn = [];   // [write, read] per turn, to separate churn from cold-start
  let txt;
  try { txt = readFileSync(f, "utf8"); } catch { continue; }
  for (const ln of txt.split("\n")) {
    if (!ln.trim().startsWith("{")) continue;
    let o; try { o = JSON.parse(ln); } catch { continue; }
    const u = (o.message || {}).usage || o.usage;
    if (!u || u.input_tokens == null) continue;
    read += u.cache_read_input_tokens || 0;
    create += u.cache_creation_input_tokens || 0;
    fresh += u.input_tokens || 0;
    out += u.output_tokens || 0;
    perTurn.push([u.cache_creation_input_tokens || 0, u.cache_read_input_tokens || 0]);
    turns++;
  }
  // Churn signal, length-independent: median cache_write/cache_read AFTER warmup
  // (turn 3+). A low read-fraction on its own only means a SHORT session — cold
  // writes not yet amortized — which is not a bug. Sustained large writes after
  // warmup is real prefix churn. Healthy ≈ 0.005–0.02; investigate above ~0.1.
  // Guard div-by-tiny: a cold turn (read≈0) would explode the ratio, so only score
  // turns with a real cache-read denominator (>1000 tok).
  const warm = perTurn.slice(3).filter(([, r]) => r > 1000).map(([w, r]) => w / r);
  const churn = warm.length ? warm.slice().sort((a, b) => a - b)[Math.floor(warm.length / 2)] : null;
  const billed = read + create + fresh;
  if (turns < MIN_TURNS || billed === 0) continue;
  // project key = the parent dir name, de-slugged loosely
  const projectDir = f.split("/").slice(-2, -1)[0];
  const key = projectDir.replace(HOME_SLUG, "").replace(/^-(Projects-)?/, "").slice(0, 46);
  (proj[key] ||= { read: 0, create: 0, fresh: 0, out: 0, turns: 0, files: 0, churn: [] });
  const P = proj[key];
  P.read += read; P.create += create; P.fresh += fresh; P.out += out; P.turns += turns; P.files++;
  if (churn != null) P.churn.push(churn);
  sessions.push({ key, turns, billed, readFrac: read / billed, freshFrac: fresh / billed, churn });
}
const median = (v) => (v.length ? v.slice().sort((a, b) => a - b)[Math.floor(v.length / 2)] : 0);

const pct = (x) => (100 * x).toFixed(1) + "%";
const sumBilled = Object.values(proj).reduce((a, p) => a + p.read + p.create + p.fresh, 0);
const sumRead = Object.values(proj).reduce((a, p) => a + p.read, 0);
const sumCreate = Object.values(proj).reduce((a, p) => a + p.create, 0);
const sumFresh = Object.values(proj).reduce((a, p) => a + p.fresh, 0);

console.log(`\ncache audit — last ${DAYS}d, sessions with ≥${MIN_TURNS} model turns`);
console.log(`files ${sessions.length} · projects ${Object.keys(proj).length} · billed-input ${(sumBilled/1e6).toFixed(1)}M tok\n`);
console.log(`OVERALL  cache_read ${pct(sumRead/sumBilled)}  cache_write ${pct(sumCreate/sumBilled)}  fresh ${pct(sumFresh/sumBilled)}`);
console.log(`(benchmark baseline was 83–88% cache_read)\n`);

console.log("per project — read% is length-biased (short sessions read less); churn is the real signal:");
console.log("churn = median write/read after turn 3. healthy ≈ 0.005–0.02; investigate above ~0.1.\n");
const rows = Object.entries(proj).map(([k, p]) => ({ k, billed: p.read + p.create + p.fresh, rf: p.read / (p.read + p.create + p.fresh), sess: p.files, churn: median(p.churn) }))
  .sort((a, b) => b.churn - a.churn).slice(0, 15);
for (const r of rows) console.log(`  churn ${r.churn.toFixed(3)}  read ${pct(r.rf).padStart(6)}  ${(r.billed/1e6).toFixed(2)}M  ${String(r.sess).padStart(3)} sess  ${r.k}`);

console.log("\nhighest-churn sessions (≥8 turns, ≥100k billed) — real prefix-invalidation suspects:");
for (const s of sessions.filter(s => s.billed > 100_000 && s.turns >= 8 && s.churn != null).sort((a, b) => b.churn - a.churn).slice(0, 10))
  console.log(`  churn ${s.churn.toFixed(3)}  read ${pct(s.readFrac).padStart(6)}  ${(s.billed/1e6).toFixed(2)}M  ${s.turns}t  ${s.key}`);
