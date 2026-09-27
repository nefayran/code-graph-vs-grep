#!/usr/bin/env node
// cbm-lean — a thin MCP server in front of the codebase-memory-mcp binary.
//
// Why it exists: measured on 5 structural questions (haiku, one rep), letting the
// model talk to cbm directly cost 2.35x MORE billed input than plain grep/read,
// because a single `search_graph` hit is ~1.3 KB of JSON. Most of that is metrics
// nobody asked for, and two fields are outright body dumps: `bt` (every
// identifier in the function) and `sp` (a numeric fingerprint vector). Stripping
// them leaves ~120 bytes per hit — the same answer, an order of magnitude cheaper.
//
// So this server: (1) exposes 8 tools instead of cbm's 14, with short schemas,
// (2) strips the noise keys from every response, (3) caps result counts and total
// response size by default. It shells out to `codebase-memory-mcp cli <tool>`,
// which keeps the heavy JSON out of the model's context entirely — the
// filtering happens here, not in the conversation.
//
// Raw cbm stays installed; `codebase-memory-mcp cli …` from a shell is unchanged.

import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { promisify } from "node:util";

const exec = promisify(execFile);

const BIN =
  process.env.CBM_BIN ||
  [`${homedir()}/.local/bin/codebase-memory-mcp`, "/usr/local/bin/codebase-memory-mcp"].find(existsSync) ||
  "codebase-memory-mcp";

// Response byte cap. Deliberately generous: an agent's billed input grows with
// the SQUARE of its turn count (every turn re-sends the whole history), so a cap
// tight enough to make the model ask again costs more than the bytes it saved.
// Measured: capping graph_arch at 12k turned one 7-turn answer into 18 turns and
// 267k -> 708k billed input. Cut only what Claude Code would truncate anyway
// (25k tokens), and let a single answer be big.
const MAX_CHARS = Number(process.env.CBM_LEAN_MAX_CHARS || 60000);

// Fields dropped from every response object, at any depth. Two classes:
// per-symbol static metrics (complexity, loop shape, degrees) that no code
// question needs, and `bt`/`sp`/`fp`, which are body-token dumps and hash
// vectors — pure weight. Anything not listed survives, so a cbm upgrade that
// adds a useful field passes through untouched.
const NOISE = new Set([
  "fp", "sp", "bt",
  "complexity", "cognitive",
  "loop_count", "loop_depth", "transitive_loop_depth",
  "self_recursive", "recursive", "recursion_in_loop", "unguarded_recursion",
  "param_count", "max_access_depth",
  "linear_scan_in_loop", "alloc_in_loop",
  "in_degree", "out_degree",
  "is_test", "is_entry_point",
  "size_bytes", "git",
]);

function strip(v) {
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      if (NOISE.has(k)) continue;
      // graph_schema advertises property NAMES as string arrays. Leaving the noise
      // fields listed there invites `RETURN a.bt` — a Cypher column this stripper
      // cannot recognise, so the body dump would sail straight into the context.
      if (k === "properties" && Array.isArray(val) && val.every((x) => typeof x === "string")) {
        out[k] = val.filter((x) => !NOISE.has(x));
        continue;
      }
      if (val === null || val === false) continue; // absent flags are not information
      out[k] = strip(val);
    }
    return out;
  }
  return v;
}

// tool name -> { cbm tool, flag defaults, description, schema }
const TOOLS = {
  graph_projects: {
    cbm: "list_projects",
    desc: "Indexed repos: name (needed by every other tool), path, branch, node/edge counts.",
    schema: { type: "object", properties: {} },
  },
  graph_index: {
    cbm: "index_repository",
    desc: "Index a git repo. Returns the project name to pass to the other tools.",
    schema: {
      type: "object",
      properties: {
        repo_path: { type: "string" },
        mode: { type: "string", description: "fast | moderate | full. Default fast." },
      },
      required: ["repo_path"],
    },
    defaults: { mode: "fast" },
  },
  graph_find: {
    cbm: "search_graph",
    desc: "Find symbols by name/keyword. Returns name, qualified_name, label, file, signature — no metrics.",
    schema: {
      type: "object",
      properties: {
        project: { type: "string" },
        name_pattern: { type: "string", description: "Substring/glob on the symbol name." },
        query: { type: "string", description: "Keyword search (BM25) when the exact name is unknown." },
        label: { type: "string", description: "Function | Method | Class | Route | Interface …" },
        file_pattern: { type: "string" },
        limit: { type: "integer", description: "Default 50." },
        offset: { type: "integer" },
      },
      required: ["project"],
    },
    defaults: { limit: 50 },
  },
  graph_cypher: {
    cbm: "query_graph",
    desc: "Cypher over the graph. Cheapest tool here — RETURN only the columns you need. Pass `queries` (array of {name, query}) to run several in ONE call instead of one call each; results come back keyed by name.",
    schema: {
      type: "object",
      properties: {
        project: { type: "string" },
        query: { type: "string", description: "A single Cypher query." },
        queries: {
          type: "array",
          description: "Several queries in one round trip. Prefer this over consecutive single calls.",
          items: {
            type: "object",
            properties: { name: { type: "string" }, query: { type: "string" } },
            required: ["name", "query"],
          },
        },
      },
      required: ["project"],
    },
    // cbm's own `max_rows` is deliberately NOT exposed: on cbm 0.9.0 a small value
// silently returns zero rows rather than truncating — measured on a query with 7
    // real rows, max_rows 200 returned all 7 while 10, 7 and 3 each returned 0 and
    // the "no results, check your labels" hint. A model that trusted that would
    // conclude the symbol has no callers. Bound results with LIMIT in the query.
    batch: { arrayArg: "queries", singleArg: "query" },
  },
  graph_snippet: {
    cbm: "get_code_snippet",
    desc: "Exact source of a symbol by qualified_name (or bare name). Pass `qualified_names` (array) to fetch several in ONE call.",
    schema: {
      type: "object",
      properties: {
        project: { type: "string" },
        qualified_name: { type: "string" },
        qualified_names: {
          type: "array",
          items: { type: "string" },
          description: "Several symbols in one round trip.",
        },
      },
      required: ["project"],
    },
    batch: { arrayArg: "qualified_names", singleArg: "qualified_name" },
  },
  graph_trace: {
    cbm: "trace_path",
    desc: "Call chain / data flow from a function. mode: calls | data_flow | cross_service.",
    schema: {
      type: "object",
      properties: {
        project: { type: "string" },
        function_name: { type: "string" },
        mode: { type: "string" },
        direction: { type: "string" },
        depth: { type: "integer", description: "Default 3." },
      },
      required: ["project", "function_name"],
    },
    defaults: { mode: "calls", depth: 3 },
  },
  graph_arch: {
    cbm: "get_architecture",
    desc: "Project structure: modules, packages, layers, entry points, routes, hotspots. Full overview by default — do not narrow it just to save bytes.",
    schema: {
      type: "object",
      properties: {
        project: { type: "string" },
        path: { type: "string", description: "Scope to a directory prefix." },
        aspects: { type: "array", items: { type: "string" }, description: "'overview' drops the file tree; omit for everything." },
      },
      required: ["project"],
    },
  },
  graph_schema: {
    cbm: "get_graph_schema",
    desc: "Node labels, edge types and node properties available to graph_cypher. Read this before writing a non-obvious Cypher query.",
    schema: { type: "object", properties: { project: { type: "string" } }, required: ["project"] },
  },
  graph_changes: {
    cbm: "detect_changes",
    desc: "Map the working-tree git diff onto graph symbols — which functions changed and what they reach. Impact analysis for an in-progress edit.",
    schema: { type: "object", properties: { project: { type: "string" } }, required: ["project"] },
  },
  graph_grep: {
    cbm: "search_code",
    desc: "Text search enriched with the symbol each match sits in. For exact strings, plain Grep is cheaper — use this when you need the enclosing symbol.",
    schema: {
      type: "object",
      properties: {
        project: { type: "string" },
        pattern: { type: "string" },
        file_pattern: { type: "string" },
        regex: { type: "boolean" },
        mode: { type: "string", description: "compact (default) | full | files" },
        limit: { type: "integer", description: "Default 5." },
      },
      required: ["project", "pattern"],
    },
    defaults: { limit: 5, mode: "compact" },
  },
  graph_ask: {
    desc: "Answer a whole structural question in ONE round trip. Prefer this over chaining graph_find + graph_cypher + graph_snippet yourself: an agent's billed input grows with the square of its turn count, so three calls cost far more than three queries inside one call. kinds: symbol (definition + source + callers + callees), callers, callees, chain (3 hops of CALLS from a function), routes (with handler + file:line), dead_code, hotspots, overview, skeleton (all signatures+lines in a FILE — target is a file path — ~33x cheaper than reading the file).",
    schema: {
      type: "object",
      properties: {
        project: { type: "string" },
        kind: {
          type: "string",
          description: "symbol | callers | callees | chain | routes | dead_code | hotspots | overview | skeleton",
        },
        target: { type: "string", description: "Symbol name for symbol/callers/callees/chain; a FILE PATH for kind:skeleton." },
        limit: { type: "integer", description: "Rows per section. Default 50." },
      },
      required: ["project", "kind"],
    },
    composite: true,
  },
};

// Cypher bundles behind graph_ask. Each kind is a set of independent queries run
// in parallel and merged into one response — the point is to collapse what would
// otherwise be several model turns into a single tool result.
const ASK_KINDS = {
  callers: (t, n) => ({
    callers: `MATCH (a)-[:CALLS]->(b {name:'${t}'}) RETURN a.name AS caller, a.file_path AS file, a.start_line AS line LIMIT ${n}`,
  }),
  callees: (t, n) => ({
    callees: `MATCH (a {name:'${t}'})-[:CALLS]->(b) RETURN DISTINCT b.name AS callee, b.file_path AS file, b.start_line AS line LIMIT ${n}`,
  }),
  symbol: (t, n) => ({
    definition: `MATCH (f {name:'${t}'}) RETURN f.name AS name, f.qualified_name AS qualified_name, f.file_path AS file, f.start_line AS line, f.end_line AS end_line, f.signature AS signature LIMIT ${n}`,
    callers: `MATCH (a)-[:CALLS]->(b {name:'${t}'}) RETURN a.name AS caller, a.file_path AS file, a.start_line AS line LIMIT ${n}`,
    callees: `MATCH (a {name:'${t}'})-[:CALLS]->(b) RETURN DISTINCT b.name AS callee, b.file_path AS file LIMIT ${n}`,
  }),
  // The handler, its file and its line are what a route question is actually for.
  // A routes list without them sent the model off to Read 14 files by hand — 23
  // turns and 1.06M billed input on the benchmark. Note the edge direction:
  // (handler)-[:HANDLES]->(:Route), and the reverse pattern matches nothing.
  //
  // The graph's Route node is the ACTION path (`/aggregations`), not the mounted
  // URL (`/api/learners/aggregations`) — the mount prefix lives in the framework's
  // URL config (DRF router.register, Express app.use, Flask/FastAPI include), which
  // the graph does not model and which is too framework-specific to compose here
  // reliably. So instead of guessing the prefix, hand the model the routing-config
  // FILES in the same call; it reads them once and composes full paths itself. A
  // `note` says so out loud, because a bare action list read as the answer to "list
  // every HTTP route" is wrong (grep beat the graph on exactly this).
  routes: (_t, n) => ({
    routes: `MATCH (h)-[:HANDLES]->(r:Route) RETURN r.name AS action_path, h.name AS handler, h.file_path AS file, h.start_line AS line ORDER BY h.file_path LIMIT ${n}`,
    route_count: `MATCH (r:Route) RETURN count(r) AS routes`,
    url_config_files: {
      tool: "search_code",
      args: { pattern: "router.register|urlpatterns|@app\\.(route|get|post|put|delete)|app\\.use\\(|createRouter|include\\(", regex: true, mode: "files" },
    },
    note: { literal: "action_path is the handler-level path only; the mount prefix (e.g. /api/learners) lives in url_config_files — read those to compose full URLs." },
  }),
  // cbm 0.9.0 has no variable-length paths (`[:CALLS*1..3]` returns nothing), so a
  // chain is three fixed-length patterns in one round trip.
  chain: (t, n) => ({
    hop1: `MATCH (a {name:'${t}'})-[:CALLS]->(b) RETURN DISTINCT b.name AS callee, b.file_path AS file, b.start_line AS line LIMIT ${n}`,
    hop2: `MATCH (a {name:'${t}'})-[:CALLS]->(b)-[:CALLS]->(c) RETURN DISTINCT b.name AS via, c.name AS callee, c.file_path AS file, c.start_line AS line LIMIT ${n}`,
    hop3: `MATCH (a {name:'${t}'})-[:CALLS]->(b)-[:CALLS]->(c)-[:CALLS]->(d) RETURN DISTINCT b.name AS via1, c.name AS via2, d.name AS callee, d.file_path AS file LIMIT ${n}`,
  }),
  // NOT a Cypher bundle: cbm 0.9.0 rejects `WHERE NOT ()-[:CALLS]->(f)` outright
  // ("expected token type 85, got 67"), so unreferenced symbols come from
  // search_graph's own degree filters instead.
  dead_code: (_t, n) => ({
    unreferenced: { tool: "search_graph", args: { label: "Function", max_degree: 0, exclude_entry_points: true, limit: n } },
  }),
  hotspots: (_t, n) => ({
    most_called: `MATCH (a)-[:CALLS]->(b) RETURN b.name AS callee, b.file_path AS file, count(*) AS callers ORDER BY callers DESC LIMIT ${n}`,
    widest_fanout: `MATCH (a)-[:CALLS]->(b) RETURN a.name AS caller, a.file_path AS file, count(DISTINCT b.name) AS callees ORDER BY callees DESC LIMIT ${n}`,
  }),
  // Backlog #3 — skeleton: every symbol's signature + line in a file, WITHOUT the
  // bodies. Reading the file whole was 177k B / ~44k tok on views.py; this returns
  // ~5k B (~33x less) and is enough to answer "what's in this module and where".
  // `target` here is a FILE PATH, not a symbol name. Read one body with graph_snippet.
  skeleton: (t, n) => ({
    symbols: `MATCH (f) WHERE f.file_path = '${t}' AND (f:Function OR f:Method OR f:Class) RETURN f.name AS name, f.signature AS signature, f.start_line AS line ORDER BY f.start_line LIMIT ${Math.max(n, 400)}`,
  }),
};

async function runAsk(args) {
  const { project, kind, target } = args;
  const limit = args.limit ?? 50;
  if (kind === "overview") {
    // get_architecture already carries node_labels with counts; an extra
    // `labels(n)[0] + count(*)` query does not aggregate on cbm 0.9.0 anyway.
    return { kind, architecture: await callCbm("get_architecture", { project }) };
  }
  const build = ASK_KINDS[kind];
  if (!build) throw new Error(`unknown kind: ${kind}. Use one of: ${["overview", ...Object.keys(ASK_KINDS)].join(", ")}`);
  // skeleton also needs a target, but it's a FILE PATH — do not run symbol-name
  // resolution on it (that would search_graph the path and substitute a stray symbol).
  const needsTarget = ["symbol", "callers", "callees", "chain"].includes(kind);
  if ((needsTarget || kind === "skeleton") && !target) {
    throw new Error(`kind '${kind}' needs a target (${kind === "skeleton" ? "file path" : "symbol name"})`);
  }

  // Name resolution in-call: the graph matches on exact `name`, so a near-miss
  // ("analyze_region" vs "analyzeRegion", or a qualified name) would return empty
  // and cost the model a graph_find turn to recover. Verify the target exists; if
  // not, fall back to search_graph and adopt the top hit's exact name, reporting the
  // substitution so the model isn't silently answered about a different symbol.
  let resolved = target;
  let resolvedNote;
  if (needsTarget) {
    const exact = await callCbm("query_graph", {
      project,
      query: `MATCH (f {name:'${target}'}) RETURN f.name LIMIT 1`,
    }).catch(() => null);
    if (!exact?.rows?.length) {
      const hit = await callCbm("search_graph", { project, name_pattern: target, limit: 1 }).catch(() => null);
      const found = hit?.results?.[0]?.name;
      if (found && found !== target) {
        resolvedNote = `no exact match for '${target}'; answered for '${found}'`;
        resolved = found;
      }
    }
  }
  const queries = build(resolved, limit);
  const out = { kind, target: resolved };
  if (resolvedNote) out.resolved = resolvedNote;
  const entries = await Promise.all(
    Object.entries(queries).map(([name, spec]) => {
      // A bundle entry is a Cypher string, an explicit {tool, args} cbm call
      // (dead_code needs search_graph's degree filters — cbm Cypher has no
      // NOT-pattern predicate), or a {literal} passthrough for a static note the
      // model should read (the routes prefix caveat). No max_rows: see graph_cypher.
      if (spec && typeof spec === "object" && "literal" in spec) {
        return Promise.resolve([name, spec.literal]);
      }
      const call =
        typeof spec === "string"
          ? callCbm("query_graph", { project, query: spec })
          : callCbm(spec.tool, { project, ...spec.args });
      // One unsupported query must not sink the whole answer — that cost a routes
      // call its entire result when the `unhandled` sub-query hit a parser error.
      return call.then((r) => [name, r], (err) => [name, { error: err.message }]);
    }),
  );
  for (const [name, result] of entries) out[name] = result;
  // A symbol question is nearly always followed by "show me the code", so fetch it
  // in the same round trip rather than earning another turn.
  if (kind === "symbol") {
    out.source = await callCbm("get_code_snippet", { project, qualified_name: resolved }).catch(
      (err) => ({ error: err.message }),
    );
  }
  return out;
}

// Args go in on stdin as one JSON object: the keys are the snake_case tool args,
// arrays and regex-bearing strings survive untouched, and there is no shell
// quoting. The raw-JSON positional argument also works but cbm 0.9.0 prints
// "passing raw JSON to 'cli <tool>' is deprecated and will be removed" for it.
//
// stdin must be written and closed explicitly with spawn — async execFile has no
// `input` option (that is execFileSync only), and a stdin-fed cbm that never sees
// EOF hangs forever.
function callCbm(cbmTool, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(BIN, ["cli", cbmTool], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`cbm ${cbmTool} timed out`));
    }, 5 * 60 * 1000);
    child.stdout.on("data", (c) => { stdout += c; });
    child.stderr.on("data", (c) => { stderr += c; });
    child.on("error", (err) => { clearTimeout(timer); reject(err); });
    child.on("close", () => {
      clearTimeout(timer);
      // cbm writes `level=info msg=…` diagnostics before the JSON payload, and
      // parse errors ("expected token type 85, got 67") land on stderr with no JSON.
      const line = stdout.trim().split("\n").filter((l) => l.startsWith("{")).pop();
      if (!line) {
        const why = stderr.trim().split("\n").filter((l) => !l.startsWith("level=")).pop();
        reject(new Error(why || `no JSON from cbm ${cbmTool}`));
        return;
      }
      try { resolve(JSON.parse(line)); } catch (err) { reject(err); }
    });
    child.stdin.end(JSON.stringify(args));
  });
}

// Bring a response under MAX_CHARS by shortening its longest arrays, halving the
// worst offender at a time, and recording what was dropped next to it. Slicing the
// serialized JSON instead would hand the model invalid syntax and no idea what is
// missing — the truncation has to stay legible, or it reads as a complete answer.
function shrink(obj) {
  const arraysOf = (v, path = []) => {
    let found = [];
    if (Array.isArray(v)) {
      found.push({ path, arr: v, size: JSON.stringify(v).length });
      v.forEach((x, i) => { found = found.concat(arraysOf(x, [...path, i])); });
    } else if (v && typeof v === "object") {
      for (const [k, val] of Object.entries(v)) found = found.concat(arraysOf(val, [...path, k]));
    }
    return found;
  };
  const at = (root, path) => path.reduce((o, k) => o[k], root);
  let out = obj;
  for (let guard = 0; guard < 40 && JSON.stringify(out).length > MAX_CHARS; guard++) {
    const worst = arraysOf(out).filter((a) => a.arr.length > 1).sort((a, b) => b.size - a.size)[0];
    if (!worst) break;
    const parent = worst.path.length ? at(out, worst.path.slice(0, -1)) : null;
    const key = worst.path[worst.path.length - 1];
    const full = worst.arr.length;
    const kept = worst.arr.slice(0, Math.max(1, Math.floor(worst.arr.length / 2)));
    if (parent) {
      parent[key] = kept;
      if (!Array.isArray(parent)) {
        // An array can be halved several times; the total in the marker must stay
        // the ORIGINAL count, not the previous round's already-shortened length.
        const prev = parent[`${key}_truncated`];
        const original = Number(String(prev || "").match(/of (\d+)$/)?.[1]) || full;
        parent[`${key}_truncated`] = `showing ${kept.length} of ${original}`;
      }
    } else {
      out = kept;
    }
  }
  return out;
}

// Run one tool's array form: N cbm calls in parallel inside a single tool call.
// The model pays one turn instead of N, which is the whole point — see MAX_CHARS.
async function runBatch(spec, args) {
  const { arrayArg, singleArg } = spec.batch;
  const items = args[arrayArg];
  const { [arrayArg]: _drop, ...rest } = args;
  const results = await Promise.all(
    items.map((item, i) => {
      // Cypher entries are {name, query}; snippet entries are bare strings.
      const isPair = item && typeof item === "object";
      const key = isPair ? item.name ?? String(i) : String(item);
      const one = isPair ? { ...rest, ...item } : { ...rest, [singleArg]: item };
      delete one.name;
      return callCbm(spec.cbm, one).then(
        (r) => [key, r],
        (err) => [key, { error: err.message }],
      );
    }),
  );
  return Object.fromEntries(results);
}

async function runTool(name, input) {
  const spec = TOOLS[name];
  if (!spec) throw new Error(`unknown tool: ${name}`);
  const args = { ...(spec.defaults || {}), ...(input || {}) };
  let raw;
  if (spec.composite) raw = await runAsk(args);
  else if (spec.batch && Array.isArray(args[spec.batch.arrayArg])) raw = await runBatch(spec, args);
  else raw = await callCbm(spec.cbm, args);
  return JSON.stringify(shrink(strip(raw)));
}

// ---- minimal MCP stdio server -------------------------------------------------

const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");

async function handle(req) {
  const { id, method, params } = req;
  if (method === "initialize") {
    return {
      protocolVersion: params?.protocolVersion || "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "cbm-lean", version: "1.0.0" },
    };
  }
  if (method === "tools/list") {
    return {
      tools: Object.entries(TOOLS).map(([name, t]) => ({
        name,
        description: t.desc,
        inputSchema: t.schema,
      })),
    };
  }
  if (method === "tools/call") {
    try {
      const text = await runTool(params?.name, params?.arguments);
      return { content: [{ type: "text", text }] };
    } catch (err) {
      // Actionable error text, per the tool-authoring guidance: the model should
      // be able to fix the call from the message alone.
      return {
        content: [{ type: "text", text: `cbm-lean error: ${err.message}. Check the project name with graph_projects, or index the repo with graph_index.` }],
        isError: true,
      };
    }
  }
  if (method === "ping") return {};
  throw Object.assign(new Error(`method not found: ${method}`), { code: -32601 });
}

let buf = "";
let pending = 0;
let stdinEnded = false;
// The client closing stdin is how an MCP stdio server is told to shut down —
// without this the process lingers and a piped caller never sees EOF.
const exitWhenDone = () => { if (stdinEnded && pending === 0) process.exit(0); };

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  const lines = buf.split("\n");
  buf = lines.pop() ?? "";
  for (const line of lines) {
    const s = line.trim();
    if (!s) continue;
    let req;
    try { req = JSON.parse(s); } catch { continue; }
    if (req.id === undefined) continue; // notification: nothing to answer
    pending++;
    handle(req)
      .then((result) => send({ jsonrpc: "2.0", id: req.id, result }))
      .catch((err) => send({ jsonrpc: "2.0", id: req.id, error: { code: err.code ?? -32603, message: err.message } }))
      .finally(() => { pending--; exitWhenDone(); });
  }
});
process.stdin.on("end", () => { stdinEnded = true; exitWhenDone(); });
