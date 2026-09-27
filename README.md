# code-graph-vs-grep

Does a code knowledge graph make a coding agent cheaper or more accurate than plain Read and Grep? This repository
answers that with a benchmark on public repositories, and it contains cbm-lean, the MCP wrapper under test.

Short answer: not cheaper. Across three settings, from 1.6k to 25k graph nodes and two Claude models, the graph
never beat Read and Grep on tokens, and with sonnet on the large repository Read and Grep were significantly
cheaper at the same accuracy. The lean wrapper did beat the raw graph server every time. The one place the graph
paid for itself was accuracy on structural questions for the small model on the large repository.

## Results

Three arms: cbm-lean plus a routing rule, the raw [codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp)
binary (cbm 0.9.0) plus the same rule, and Read, Grep and Glob only. tokenEquiv prices each token class at its
multiplier: input + 1.25 × cache write + 0.1 × cache read. p values are Wilcoxon signed-rank tests over per-question
medians. Claude Code 2.1.283.

| setting | cbm-lean | raw cbm | Read and Grep | cbm-lean vs Read and Grep | cbm-lean vs raw cbm |
|---|---|---|---|---|---|
| 3 small repos (1.6k to 5k nodes), haiku 4.5, 108 runs | 30,321 · 28/36 | 43,846 · 32/36 | 31,159 · 33/36 | no difference, p = 0.13 | cheaper on 8 of 12, p = 0.021 |
| dub (25k nodes), haiku 4.5, 72 runs | 18,791 · 22/24 | 20,687 · 22/24 | 14,955 · 20/24 | no difference, p = 0.18 | cheaper on 11 of 12, p = 0.003 |
| dub (25k nodes), sonnet 5, 72 runs | 17,227 · 22/24 | 23,085 · 22/24 | 13,348 · 22/24 | Read and Grep cheaper on 11 of 12, p = 0.034 | cheaper on 9 of 12, p = 0.007 |

Cells show median tokenEquiv and correct answers. In every setting the raw binary also cost more than Read and
Grep (p = 0.034, 0.012 and 0.007). The runs in `results/` cost $14.69 at API prices; pilot runs are not included.

What this means in practice:

- Mounting a graph to save tokens does not work with Claude models on repositories up to 25k nodes.
- If you already use cbm, use it through cbm-lean: it was cheaper than the raw server in all three settings.
- On the large repository haiku answered structural questions correctly 12 of 12 times with the graph and 8 of 12
  with Read and Grep, at a median of 23.5k against 16.0k tokens on those questions. Sonnet got the same structural
  score either way.
- Not measured: repositories well beyond 25k nodes, Opus, and long interactive sessions.

Per-question numbers are in the tables below and the raw runs, answers included, are in `results/`.

<details>
<summary>Per question: three small repos, haiku 4.5 (median tokenEquiv, correct of 3)</summary>

| question | cbm-lean | raw cbm | Read and Grep |
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

</details>

<details>
<summary>Per question: dub, haiku 4.5 and sonnet 5 (median tokenEquiv, correct of 2)</summary>

| question | haiku cbm-lean | haiku raw cbm | haiku Read and Grep | sonnet cbm-lean | sonnet raw cbm | sonnet Read and Grep |
|---|---|---|---|---|---|---|
| callers | 26,893 (2) | 31,821 (2) | 14,059 (2) | 19,459 (2) | 38,180 (2) | 10,624 (2) |
| callees | 13,478 (2) | 20,291 (2) | 15,428 (2) | 16,219 (2) | 29,525 (2) | 15,954 (2) |
| symbol-source | 17,141 (2) | 17,644 (2) | 11,648 (2) | 15,581 (2) | 29,539 (2) | 14,089 (2) |
| architecture | 27,475 (2) | 44,016 (1) | 27,120 (0) | 26,235 (0) | 22,234 (0) | 24,970 (0) |
| call-chain | 50,417 (2) | 78,342 (1) | 29,490 (0) | 43,680 (2) | 69,504 (2) | 34,951 (2) |
| route-scan | 19,752 (2) | 15,842 (2) | 14,699 (2) | 14,333 (2) | 12,958 (2) | 13,646 (2) |
| config-value | 31,798 (2) | 41,331 (2) | 52,154 (2) | 20,662 (2) | 39,254 (2) | 17,552 (2) |
| env-flag | 12,042 (2) | 15,372 (2) | 12,173 (2) | 10,268 (2) | 21,724 (2) | 9,839 (2) |
| error-string | 19,087 (2) | 40,159 (2) | 15,938 (2) | 19,770 (2) | 33,370 (2) | 33,210 (2) |
| class-def | 13,220 (0) | 14,111 (2) | 14,471 (2) | 9,848 (2) | 17,168 (2) | 9,244 (2) |
| const-value | 12,302 (2) | 18,988 (2) | 11,800 (2) | 10,180 (2) | 21,099 (2) | 9,712 (2) |
| import-site | 14,373 (2) | 23,352 (2) | 8,102 (2) | 14,597 (2) | 11,280 (2) | 10,199 (2) |

</details>

### Where each arm went wrong

- Line numbers from the graph. On exact questions the graph arm sometimes answered from graph output instead of
  grepping, as its rule told it to, and missed the line: login.py:33 instead of :34 (33 is the `if` above the
  `raise`), config.py:74 instead of :15 for a class the graph stores at 15 to 88, client.ts:129 instead of :59.
- Duplicate names. The FastAPI template has two handlers called create_user. Asked for the admin endpoint, both
  graph arms traced the unauthenticated one in 5 of 6 runs; Read and Grep found the superuser-guarded one every time.
- Stopping early. On dub, haiku with Read and Grep missed the actual database write of a call chain in both runs.
- A flawed check. Every sonnet run, in every arm, left `packages/tinybird` out of the dub architecture answer. That
  folder holds Tinybird data files and has no package.json, so the models were arguably right. All six sonnet
  misses are this one question; treating it as unscorable changes no comparison above.

## Mounting a graph is not using it

Claude Code 2.1.283 defers MCP tool schemas behind ToolSearch by default, and haiku in headless mode did not load
them. The twelve small-repo questions, one repetition each:

| setup | runs that called the graph | correct | median tokenEquiv |
|---|---|---|---|
| default tool loading, routing rule in the prompt | 2/12 | 11/12 | 41,008 |
| all schemas loaded, no routing rule | 4/12 | 9/12 | 62,008 |
| all schemas loaded, routing rule (the main run) | 22/36 | 28/36 | 30,321 |

In six pilot runs with default loading the graph was never called. With `ENABLE_TOOL_SEARCH=false` the same
callers question went through `graph_projects` and `graph_ask` in three turns. Loaded schemas are paid for whether
or not anything calls them, which made the mounted graph with no rule the most expensive setup. Even with the rule,
sonnet used the graph in 10 of 24 runs on dub and chose Grep for the rest.

If you mount a graph anyway, load its schemas and give the agent the rule, for example in CLAUDE.md:

```
Structure (who calls what, call chains, routes, module layout, a symbol end to end): one graph_ask call.
Exact strings, config values, flags, error text: Grep and Read.
```

## cbm-lean

A thin MCP server in front of codebase-memory-mcp. It gives an agent 11 short tools instead of cbm's 14, strips the
fields no code question needs, and answers a whole structural question in one call.

```
git clone https://github.com/nefayran/code-graph-vs-grep
claude mcp add cbm --scope user -- node "$PWD/code-graph-vs-grep/server.mjs"
printf '{"repo_path":"%s","mode":"fast"}' /path/to/repo | codebase-memory-mcp cli index_repository
node code-graph-vs-grep/digest.mjs    # optional: per-repo digests
```

Requires Node 18 or newer and codebase-memory-mcp 0.9.0 on PATH (or `CBM_BIN`). No npm dependencies.

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
  static metrics. A `graph_find` hit drops from 1,342 to 251 bytes. Unlisted fields pass through.
- The response cap is generous (60,000 characters, `CBM_LEAN_MAX_CHARS`). When it bites, the longest arrays are
  halved and labelled in the response, so the model gets valid JSON and knows what was withheld.
- One failing sub-query resolves to `{error}` on its own instead of sinking the whole answer.
- It talks to cbm over stdin JSON. The raw-JSON positional argument is deprecated in cbm 0.9.0, and a child fed
  through async `execFile` never sees EOF and hangs.

`digest.mjs` writes `~/.claude/cbm-digests/<project>.md` for each indexed repo (node kinds, a module map, packages,
layers, entry points, routes, hotspots), about 4.5 KB from one `get_architecture` call and one file query. Each
digest records the HEAD it was built from, so staleness is keyed to commits rather than age.

### cbm 0.9.0 traps

Each of these produced a wrong answer at some point:

- A small `max_rows` returns zero rows. On a query with 7 real rows, `max_rows: 200` returned all 7, while 10, 7
  and 3 returned nothing plus "Query returned no results. Use get_graph_schema()". Bound queries with `LIMIT`.
- The file property is `file_path`. `a.file` is in no schema, raises no error and yields an empty column.
- There is no NOT-pattern predicate: `WHERE NOT ()-[:CALLS]->(f)` is a parse error.
- There are no variable-length paths: `[:CALLS*1..3]` returns nothing, so hops are spelled out.
- Route handlers point at the route, `(handler)-[:HANDLES]->(:Route)`; the mirrored pattern matches nothing.
- The Route node holds the action path, not the mounted URL; the prefix lives in the framework's URL config.
- Next.js route handlers written as `export const GET = withWorkspace(...)` produce no Route nodes: dub has none.
- `labels(n)[0]` with `count(*)` does not aggregate; use `node_labels` from `get_architecture`.
- cbm indexes per git repository; a folder that is not a repository has no index.

## Benchmark

`bench/questions.json` (three small repositories) and `bench/questions-large.json` (dub) pin each repository to a
commit and list twelve questions, six structural and six exact-match, each with the substrings a correct answer
must contain. `bench/run.mjs` sends every question through `claude -p` under each arm and records billed tokens,
turns, cost, the tools each run called and the answer.

Controls, each added because its absence gave a wrong conclusion earlier:

- Bash and Agent are denied in every arm. Scoped Bash grants do not match piped commands, and an arm that
  delegates to subagents hides turns while still paying for them.
- `--strict-mcp-config` and `--setting-sources project` keep the machine's own MCP servers, hooks and plugins out.
  The repositories live outside any tree with a CLAUDE.md above them, because Claude Code loads those files from
  parent directories.
- The routing rule goes only to the arms that have a graph, and all schemas load up front unless
  `--tool-search default` is passed.
- Arm order rotates per repetition, so no arm always runs on a warm cache.
- A run that calls an MCP tool its arm does not own is marked invalid.
- Answers are kept: tokens saved on a wrong answer are not savings.

```
bash bench/setup.sh
bash bench/setup.sh bench/questions-large.json
CLAUDE_BIN=$(command -v claude) node bench/run.mjs --reps 3
node bench/run.mjs --questions bench/questions-large.json --model claude-sonnet-5 --reps 2
node bench/run.mjs --arms graph --tool-search default --reps 1
node bench/run.mjs --arms graph-unguided --reps 1
python3 bench/stats.py results/*.json
```

An earlier round on private repositories had found cbm-lean 26% cheaper than grep on haiku and 18% on sonnet. It
loaded a CLAUDE.md with the routing rule into every arm, including the arm with no graph, and its repositories
cannot be published; it did not reproduce here. Two of its lessons shaped the wrapper and still hold:

- Turns cost more than bytes. Every turn re-sends the history, so billed input grows with the square of the turn
  count. A version that capped responses at 12k characters made one answer take 18 turns instead of 7 and raised
  billed input from 267k to 708k. Never narrow a response to save bytes.
- With Bash allowed, the grep arm spent 1.8M billed input on `grep | head` loops; with Bash denied it needed 252k.

## Tools

- `tools/cache-audit.mjs`: the share of billed input served from the prompt cache in your own Claude Code
  sessions, overall and per project.
- `tools/mcp-tax.mjs`: the start-of-session token cost of an MCP server's schemas.
- `tools/llmlingua.py`: whether identifiers and signatures survive LLMLingua-2 compression on a code file.

## License

MIT. codebase-memory-mcp is a separate project under its own license.
