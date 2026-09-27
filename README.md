# cbm-lean

A thin MCP server in front of [codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) (cbm), a
tree-sitter code graph. It gives a coding agent 11 short tools instead of cbm's 14, strips the fields no code
question needs, and answers a whole structural question in one call. The repository also holds a digest generator
and the benchmark that decides whether any of this is worth mounting.

## Results on public repositories

Setup: claude-haiku-4-5-20251001 in Claude Code 2.1.283, cbm 0.9.0. Twelve questions (six structural, six
exact-match) on three public repositories pinned to commits, three arms, three repetitions: 108 runs, $6.37 at API
prices. tokenEquiv prices each token class at its multiplier: input + 1.25 × cache write + 0.1 × cache read.

| arm | median tokenEquiv (95% CI) | median turns | correct |
|---|---|---|---|
| graph: cbm-lean plus the routing rule | 30,321 (25,952 to 46,445) | 4 | 28/36 |
| rawgraph: the cbm binary plus the routing rule | 43,846 (31,394 to 60,452) | 5.5 | 32/36 |
| nograph: Read, Grep and Glob only | 31,159 (19,524 to 39,600) | 4.5 | 33/36 |

What the tests support (Wilcoxon signed-rank over per-question medians):

- cbm-lean is cheaper than the raw binary: on 8 of 12 questions, p = 0.021.
- The raw binary costs more than plain Read and Grep: it was cheaper on only 3 of 12, p = 0.034.
- Between cbm-lean and plain Read and Grep there is no measurable difference: cheaper on 3 of 12, p = 0.13.

By question type (median tokenEquiv, correct):

| | graph | rawgraph | nograph |
|---|---|---|---|
| structural | 46,708, 16/18 | 63,281, 14/18 | 38,060, 16/18 |
| exact | 25,233, 12/18 | 29,725, 18/18 | 18,904, 17/18 |

Per question (median tokenEquiv, correct of 3):

| question | graph | rawgraph | nograph |
|---|---|---|---|
| callers | 63,826 (3) | 97,124 (3) | 52,931 (3) |
| callees | 29,229 (3) | 40,739 (3) | 32,349 (3) |
| symbol-source | 38,410 (3) | 37,851 (3) | 37,873 (3) |
| architecture | 21,033 (3) | 31,394 (2) | 41,720 (1) |
| call-chain | 52,869 (1) | 101,061 (0) | 41,328 (3) |
| route-scan | 47,027 (3) | 59,494 (3) | 19,524 (3) |
| config-value | 34,577 (3) | 34,346 (3) | 18,977 (3) |
| env-flag | 60,184 (3) | 54,188 (3) | 65,035 (3) |
| error-string | 22,538 (1) | 29,088 (3) | 12,010 (3) |
| class-def | 11,983 (1) | 18,380 (3) | 11,207 (3) |
| const-value | 29,573 (1) | 48,706 (3) | 21,954 (2) |
| import-site | 19,942 (3) | 17,262 (3) | 15,379 (3) |

The graph earned its place on the architecture question: 21k tokens and 3 of 3 correct, against 42k and 1 of 3
for Read and Grep, which listed only the backend. It lost in three ways:

- Line numbers. Twice the graph arm answered an exact question from the graph instead of grepping, as its rule
  told it to, and missed the line: login.py:33 instead of :34 for the error message (33 is the `if` above the
  `raise`), and config.py:74 instead of :15 for the Settings class. The graph itself stores Settings at lines 15
  to 88, so the wrong number came from reading the tool output, not from the index.
- Duplicate names. The template has two handlers called create_user. Asked for the admin endpoint, both graph
  arms traced the unauthenticated one in private.py in 5 of 6 runs; Read and Grep found the superuser-guarded one
  in users.py in 3 of 3.
- Plain lookups. Routes, config values and error strings were two to three times cheaper with Grep.

These numbers do not reproduce an earlier round on private repositories, where cbm-lean came out 26% cheaper than
grep on haiku and 18% on sonnet. That round loaded a CLAUDE.md with the routing rule into every arm, including
the arm with no graph, and its repositories cannot be published. The results here are the ones you can check.

## Mounting a graph is not using it

Claude Code 2.1.283 defers MCP tool schemas behind ToolSearch by default, and haiku in headless mode did not load
them. The same twelve questions, one repetition each:

| setup | runs that called the graph | correct | median tokenEquiv |
|---|---|---|---|
| default tool loading, routing rule in the prompt | 2/12 | 11/12 | 41,008 |
| all schemas loaded, no routing rule | 4/12 | 9/12 | 62,008 |
| all schemas loaded, routing rule (the main run) | 22/36 | 28/36 | 30,321 |

In six pilot runs with default loading the graph was never called. With `ENABLE_TOOL_SEARCH=false` the callers
question went through `graph_projects` and `graph_ask` in three turns. Loaded schemas are paid for whether or not
anything calls them, which is why the mounted graph with no rule was the most expensive setup. Larger models may
call ToolSearch more readily; that was not measured.

If you mount a graph, load its schemas and give the agent the rule, for example in CLAUDE.md:

```
Structure (who calls what, call chains, routes, module layout, a symbol end to end): one graph_ask call.
Exact strings, config values, flags, error text: Grep and Read.
```

## Install

Requires Node 18 or newer and codebase-memory-mcp 0.9.0 on PATH (or `CBM_BIN`). No npm dependencies.

```
git clone https://github.com/nefayran/cbm-lean
claude mcp add cbm --scope user -- node "$PWD/cbm-lean/server.mjs"
printf '{"repo_path":"%s","mode":"fast"}' /path/to/repo | codebase-memory-mcp cli index_repository
node cbm-lean/digest.mjs    # optional: per-repo digests, see below
```

## What the server does

- `graph_ask(project, kind, target)` answers a whole question in one round trip. Kinds: `symbol` (definition,
  source, callers, callees), `callers`, `callees`, `chain` (three hops of CALLS), `routes` (action path, handler,
  file:line and the URL-config files that hold the mount prefixes), `dead_code`, `hotspots`, `overview`, and
  `skeleton` (every signature in a file).
- It resolves names inside the call. The graph matches on the exact name, so a near miss would return nothing and
  cost a recovery turn. `graph_ask` checks that the target exists and otherwise adopts the top `search_graph` hit,
  reporting the substitution in a `resolved` field.
- Batch forms: `graph_cypher(queries: [...])` and `graph_snippet(qualified_names: [...])` run several cbm calls
  inside one tool call.
- It strips noise at any depth: `bt` (every identifier in the function body), the `sp` and `fp` hash vectors, and
  static metrics. A `graph_find` hit drops from 1,342 to 251 bytes. Unlisted fields pass through, so a cbm
  upgrade that adds something useful is not swallowed.
- The response cap is generous (60,000 characters, `CBM_LEAN_MAX_CHARS`). When it bites, the longest arrays are
  halved and labelled in the response, so the model gets valid JSON and knows what was withheld.
- One failing sub-query resolves to `{error}` on its own instead of sinking the whole answer.
- It talks to cbm over stdin JSON. The raw-JSON positional argument is deprecated in cbm 0.9.0, and a child fed
  through async `execFile` never sees EOF and hangs.

## Precomputed digests

`digest.mjs` writes `~/.claude/cbm-digests/<project>.md` for each indexed repo: node kinds, a module map, packages,
layers, clusters, entry points, routes and hotspots, about 4.5 KB from one `get_architecture` call and one file
query. A session hook can inject only the inventory and the digest paths, and the agent reads the one digest it
needs.

Each digest records the HEAD it was built from (`<!-- HEAD <sha> -->`), so staleness is keyed to commits rather
than age: a digest built from an old commit is a wrong answer, not a slow one. The module map expands any directory
that is still too big, because a fixed depth collapses a monorepo to `apps/`, and it skips `public/`, `dist/` and
`node_modules/`.

## cbm 0.9.0 traps

Each of these produced a wrong answer at some point:

- A small `max_rows` returns zero rows. On a query with 7 real rows, `max_rows: 200` returned all 7, while 10, 7
  and 3 returned nothing plus "Query returned no results. Use get_graph_schema()". A model that trusts it reports
  "no callers". The wrapper does not expose the parameter; bound queries with `LIMIT`.
- The file property is `file_path`. `a.file` is in no schema, raises no error and yields an empty column.
- There is no NOT-pattern predicate: `WHERE NOT ()-[:CALLS]->(f)` is a parse error, so dead code comes from the
  degree filters of `search_graph`.
- There are no variable-length paths: `[:CALLS*1..3]` returns nothing, so hops are spelled out (`kind: "chain"`).
- Route handlers point at the route, `(handler)-[:HANDLES]->(:Route)`; the mirrored pattern matches nothing.
- The Route node holds the action path, not the mounted URL. The prefix lives in the framework's URL config, which
  the graph does not model, so `kind: "routes"` returns the config files with the routes.
- `labels(n)[0]` with `count(*)` does not aggregate; use `node_labels` from `get_architecture`.
- cbm indexes per git repository; a folder that is not a repository has no index.

## Benchmark

`bench/questions.json` holds the repositories, their commits and the twelve questions, each with the substrings a
correct answer must contain (the right symbol at the right file:line). `bench/run.mjs` sends every question through
`claude -p` under each arm and records billed tokens, turns, cost, the tools each run called and the answer.

Controls, each added because its absence gave a wrong conclusion earlier:

- Bash and Agent are denied in every arm. Scoped Bash grants do not match piped commands, and an arm that
  delegates to subagents hides turns while still paying for them.
- `--strict-mcp-config` and `--setting-sources project` keep the machine's own MCP servers, hooks and plugins out.
  The repositories live outside any tree with a CLAUDE.md above them, because Claude Code loads those files from
  parent directories.
- The routing rule goes only to the arms that have a graph.
- Arm order rotates per repetition, so no arm always runs on a warm cache.
- A run that calls an MCP tool its arm does not own is marked invalid.
- Answers are kept: tokens saved on a wrong answer are not savings.

```
bash bench/setup.sh
CLAUDE_BIN=$(command -v claude) node bench/run.mjs --reps 3
node bench/run.mjs --arms graph --tool-search default --reps 1
node bench/run.mjs --arms graph-unguided --reps 1
python3 bench/stats.py results/haiku-4.5-main.json
```

`results/` has the raw runs behind every number above, with local paths removed.

Two lessons from the earlier private round shaped the wrapper itself:

- Turns cost more than bytes. Every turn re-sends the history, so billed input grows with the square of the turn
  count. The first version capped responses at 12k characters; the model asked again, one answer took 18 turns
  instead of 7, and billed input went from 267k to 708k. Never narrow a response to save bytes.
- With Bash allowed, the grep arm spent 1.8M billed input on `grep | head` loops; with Bash denied it needed 252k.
  Much of the first "graph loses" result was measuring shell exploration.

## Tools

- `tools/cache-audit.mjs`: the share of billed input served from the prompt cache in your own Claude Code
  sessions, overall and per project.
- `tools/mcp-tax.mjs`: the start-of-session token cost of an MCP server's schemas.
- `tools/llmlingua.py`: whether identifiers and signatures survive LLMLingua-2 compression on a code file.

## License

MIT. codebase-memory-mcp is a separate project under its own license.
