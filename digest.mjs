#!/usr/bin/env node
// Pre-computes a structural digest per indexed repo, so an agent can answer
// "what is this project" by reading a file instead of querying the graph.
//
// Why: an agent's billed input grows with the square of its turn count, so the
// cheapest structural answer is the one that costs zero tool calls. Anthropic's
// context-engineering guidance calls this the hybrid strategy — retrieve some
// data up front for speed, explore further at the agent's discretion, because
// "runtime exploration is slower than retrieving pre-computed data". Measured
// here: the grep-only arm answered an architecture question in ONE turn because
// it had the file list already, while the graph arm spent 18 turns building the
// same picture from queries.
//
// The digest is NOT injected wholesale. The session-start hook injects only the
// inventory table plus each digest's path (lightweight identifiers), and the
// agent reads the one it needs. That keeps the always-on cost at ~100 tokens
// regardless of how many repos are indexed.
//
//   node digest.mjs            # refresh every indexed project
//   node digest.mjs --project X
//
// Output: ~/.claude/cbm-digests/<project>.md plus index.md

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const SELF = fileURLToPath(import.meta.url).replace(homedir(), "~");

const BIN =
  process.env.CBM_BIN ||
  [`${homedir()}/.local/bin/codebase-memory-mcp`, "/usr/local/bin/codebase-memory-mcp"].find(existsSync) ||
  "codebase-memory-mcp";

const OUT_DIR = process.env.CBM_DIGEST_DIR || join(homedir(), ".claude", "cbm-digests");
const only = process.argv.includes("--project") ? process.argv[process.argv.indexOf("--project") + 1] : null;
// Timestamps are passed in rather than read from the clock so a caller can make
// the output reproducible; falls back to now.
const STAMP = process.env.CBM_DIGEST_STAMP || new Date().toISOString().slice(0, 10);

async function cbm(tool, args) {
  const { stdout } = await exec(BIN, ["cli", tool, JSON.stringify(args)], {
    maxBuffer: 256 * 1024 * 1024,
    timeout: 5 * 60 * 1000,
  });
  const line = stdout.trim().split("\n").filter((l) => l.startsWith("{")).pop();
  if (!line) throw new Error(`no JSON from cbm ${tool}`);
  return JSON.parse(line);
}

// A digest is stale the moment the repo's HEAD moves, not after a day — a stale
// digest is a wrong answer, not a slow one. Stamp HEAD so the hook can compare.
async function headSha(root) {
  if (!root) return null;
  try {
    const { stdout } = await exec("git", ["-C", root, "rev-parse", "HEAD"], { timeout: 10000 });
    return stdout.trim();
  } catch { return null; }
}

// Never pass max_rows — on cbm 0.9.0 a small value silently returns zero rows
// instead of truncating. Bound with LIMIT inside the query.
const rows = (r) => (r?.rows ?? []).map((row) => row.map((c) => (c === "" ? "-" : c)));

function table(header, body) {
  if (!body.length) return "_none_\n";
  return [
    `| ${header.join(" | ")} |`,
    `|${header.map(() => "---").join("|")}|`,
    ...body.map((r) => `| ${r.join(" | ")} |`),
    "",
  ].join("\n");
}

// get_architecture already carries every section a digest needs — node_labels,
// languages, packages, layers, clusters, entry_points, routes, hotspots — so this
// is ONE cbm call per project. An earlier version re-derived the same facts with
// five extra Cypher queries; `labels(n)[0]` + `count(*)` also turned out not to
// aggregate on cbm 0.9.0 (it emits one `["Section"]` row per node, no count).
// cbm's `packages` section is top-level directories, which in a monorepo means the
// module map reads "admin-dashboard / admin-dashboard-bff / Makefile" — too coarse
// to answer "what are this app's modules". Measured: a digest carrying only that
// section produced a four-bullet answer where reading the tree gave app/, features/,
// components/, hooks/, lib/, … So derive a real module map from file paths, one
// query, aggregated here rather than by the model.
async function moduleMap(project) {
  const r = await cbm("query_graph", {
    project,
    query: "MATCH (f:File) RETURN f.file_path AS path LIMIT 20000",
  }).catch(() => null);
  // Static/vendor/build directories are files, not modules — `public/` alone was
  // 210 entries and outranked every real module in the first version.
  const NOT_A_MODULE = /(^|\/)(public|static|assets|dist|build|out|coverage|vendor|node_modules|__pycache__|\.venv|venv|\.git|\.next|\.nx)\//;
  const paths = (r?.rows ?? [])
    .map(([p]) => String(p))
    .filter((p) => p.includes("/") && !NOT_A_MODULE.test(p));
  if (!paths.length) return [];

  // A fixed depth does not work across repo shapes: depth 1 collapses a monorepo to
  // `apps/`, depth 2 to `apps/admin-dashboard/` (524 files) — both useless as a
  // module map, while a flat repo needs depth 1. So split adaptively: start at the
  // top and keep expanding whichever directory still holds too many files, until the
  // map is granular enough or nothing splits further.
  const filesUnder = (prefix) => paths.filter((p) => p.startsWith(prefix)).length;
  const childrenOf = (prefix) => {
    // Prefixes carry a trailing slash; splitting it raw would over-count the depth
    // by one and emit `apps/x//` keys.
    const depth = prefix ? prefix.replace(/\/$/, "").split("/").length : 0;
    const kids = new Map();
    for (const p of paths) {
      if (!p.startsWith(prefix)) continue;
      const parts = p.split("/");
      if (parts.length <= depth + 1) continue; // a file directly in this dir, not a subdir
      const key = parts.slice(0, depth + 1).join("/") + "/";
      kids.set(key, (kids.get(key) ?? 0) + 1);
    }
    return kids;
  };

  // Expand only what is genuinely too big to be one module. Driving the loop by a
  // target row count instead pushed it far past useful granularity — leaf folders of
  // 9 files, one row each.
  const TOO_BIG = Math.max(30, Math.ceil(paths.length * 0.2));
  const MAX_ROWS = 40;
  let groups = new Map(childrenOf(""));
  for (let guard = 0; guard < 12 && groups.size < MAX_ROWS; guard++) {
    const expandable = [...groups.entries()]
      .filter(([prefix, n]) => n > TOO_BIG && childrenOf(prefix).size >= 1)
      .sort((a, b) => b[1] - a[1]);
    if (!expandable.length) break;
    const [prefix] = expandable[0];
    const kids = childrenOf(prefix);
    groups.delete(prefix);
    for (const [k, n] of kids) groups.set(k, n);
    // Files sitting directly in the expanded directory would otherwise vanish.
    const direct = filesUnder(prefix) - [...kids.values()].reduce((a, b) => a + b, 0);
    if (direct > 0) groups.set(`${prefix}*`, direct);
  }
  return [...groups.entries()].sort((x, y) => y[1] - x[1]).slice(0, 40);
}

// Key definitions: the exported functions and classes worth knowing where to find,
// ranked by fan-in so the list is "the symbols other code leans on", not an
// alphabetical dump. Excludes test files and cbm's synthetic `<python-builtins>` /
// `<...>` nodes (str/int/list showed up as top classes otherwise). This turns
// "where is X defined" into a zero-call file read for the symbols that matter most.
async function keyDefs(project) {
  const q = (label) =>
    cbm("query_graph", {
      project,
      query:
        `MATCH (s:${label}) WHERE ${label === "Function" ? "s.is_exported = true AND " : ""}` +
        `NOT s.file_path CONTAINS 'test' AND NOT s.file_path STARTS WITH '<' ` +
        `RETURN s.name AS name, s.file_path AS file, s.start_line AS line, s.in_degree AS fanin ` +
        `ORDER BY s.in_degree DESC LIMIT 25`,
    })
      .then((r) => (r?.rows ?? []).filter(([, file]) => file && !file.startsWith("<")))
      .catch(() => []);
  const [fns, classes] = await Promise.all([q("Function"), q("Class")]);
  return { fns, classes };
}

async function digestFor(project, rootPath) {
  const [a, modules, defs] = await Promise.all([
    cbm("get_architecture", { project }).catch((e) => ({ error: e.message })),
    moduleMap(project),
    keyDefs(project),
  ]);
  const list = (v) => (Array.isArray(v) ? v : []);
  const sha = await headSha(rootPath);
  const lines = [
    `# ${project}`,
    "",
    `Structural digest, generated ${STAMP} from the codebase-memory-mcp graph.`,
    `Refresh: \`node ${SELF} --project ${project}\``,
    sha ? `<!-- HEAD ${sha} -->` : "<!-- HEAD unknown -->",
    "",
    `- root: \`${rootPath ?? "?"}\``,
    sha ? `- HEAD when generated: \`${sha.slice(0, 12)}\`` : "",
    `- nodes: ${a.total_nodes ?? "?"} · edges: ${a.total_edges ?? "?"}`,
    `- languages: ${list(a.languages).map((l) => `${l.language} (${l.file_count} files)`).join(", ") || "-"}`,
    "",
    "## Node kinds",
    "",
    table(["label", "count"], list(a.node_labels).map((l) => [l.label, l.count])),
    "## Modules (directories, by file count)",
    "",
    table(["module", "files"], modules.map(([name, n]) => [`\`${name}\``, n])),
    "## Packages (cbm top-level split)",
    "",
    table(
      ["package", "nodes", "fan in", "fan out"],
      list(a.packages).map((p) => [p.name, p.node_count ?? "-", p.fan_in ?? "-", p.fan_out ?? "-"]),
    ),
    "## Layers",
    "",
    table(["module", "layer", "why"], list(a.layers).map((l) => [l.name, l.layer, l.reason ?? "-"])),
    "## Clusters",
    "",
    table(
      ["cluster", "members", "top symbols"],
      list(a.clusters).map((c) => [c.label ?? c.id, c.members ?? "-", list(c.top_nodes).slice(0, 5).join(", ")]),
    ),
    "## Entry points",
    "",
    table(["name", "file"], list(a.entry_points).map((e) => [e.name, e.file ?? "-"])),
    "## Routes",
    "",
    table(["route", "file", "handler"], list(a.routes).map((r) => [r.path ?? r.name, r.file ?? "-", r.handler ?? "-"])),
    "## Most-called symbols",
    "",
    table(["symbol", "fan in", "qualified name"], list(a.hotspots).map((h) => [h.name, h.fan_in ?? "-", h.qualified_name ?? "-"])),
    "## Key definitions — exported functions (by fan-in)",
    "",
    table(["symbol", "file:line", "fan in"], defs.fns.map(([n, f, l, d]) => [`\`${n}\``, `${f}:${l}`, d ?? "-"])),
    "## Key definitions — classes (by fan-in)",
    "",
    table(["class", "file:line", "fan in"], defs.classes.map(([n, f, l, d]) => [`\`${n}\``, `${f}:${l}`, d ?? "-"])),
  ];
  if (a.error) lines.push("", `_architecture query failed: ${a.error}_`);
  return lines.join("\n");
}

const listed = await cbm("list_projects", {});
const projects = (listed.projects ?? []).filter((p) => !only || p.name === only);
if (!projects.length) {
  console.error(only ? `no indexed project named ${only}` : "no indexed projects");
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
const index = [];
for (const p of projects) {
  try {
    writeFileSync(join(OUT_DIR, `${p.name}.md`), await digestFor(p.name, p.root_path));
    index.push([p.name, p.root_path, p.nodes ?? "?", (await headSha(p.root_path))?.slice(0, 12) ?? "-"]);
    console.error(`digest: ${p.name}`);
  } catch (err) {
    console.error(`digest FAILED ${p.name}: ${err.message}`);
  }
}

// A single-project refresh must NOT rewrite index.md — it would clobber the full
// inventory down to the one repo (the injected index would then list only that
// repo). index.md is rebuilt only on a full run; the hook does a full run.
if (only) {
  console.error(`(index.md left intact — single-project run)`);
  process.exit(0);
}

// index.md is what the session hook injects: identifiers only, no structure.
// Keep this small — it is injected into every session. The full digest for one
// repo stays on disk at <OUT_DIR>/<project>.md and is read only when needed, so
// the always-on cost does not grow with the number of indexed repos. Roots are
// shortened against $HOME and the digest path is stated once instead of per row.
const home = homedir();
writeFileSync(
  join(OUT_DIR, "index.md"),
  [
    `Indexed repos (codebase-memory-mcp graph). Digests generated ${STAMP}.`,
    `Structure/layout question? Read \`${OUT_DIR.replace(home, "~")}/<project>.md\` — already computed, zero graph calls.`,
    "A digest's HEAD column is the commit it was built from; if the repo has moved on, its structure section may be stale — the graph is still authoritative.",
    "",
    table(
      ["project", "root", "nodes", "HEAD@gen"],
      index.map(([name, root, nodes, sha]) => [name, String(root ?? "?").replace(home, "~"), nodes, sha]),
    ),
  ].join("\n"),
);
console.error(`index: ${join(OUT_DIR, "index.md")}`);
