# How the v2 questions are written

Read `PLAN-v2.md` first. This file is the brief for writing one repository's question set.

## Output

- `bench/questions-v2/<repo>.json`:

  ```json
  {
    "repos": { "<repo>": { "url": "https://github.com/<owner>/<name>", "dir": "<dir under ~/cbm-bench/repos>", "commit": "<full sha>" } },
    "questions": [
      { "id": "<repo>-callers-1", "kind": "structural", "type": "callers", "repo": "<repo>",
        "prompt": "…", "must": ["…", "…"] }
    ]
  }
  ```

- `bench/questions-v2/<repo>.evidence.md`: for every question, the commands you ran and the lines of code that
  prove each `must` entry, so a reviewer can check the answer key without redoing the work.

## The 16 questions

8 structural and 8 exact. `type` is one of the values below.

Structural:

- `callers` or `callees`, 3 questions: who calls a function, or what it calls. Pick functions with 3 to 6
  non-test call sites, across at least two files, and a name that is unique in the repository.
- `chain`, 2 questions: the call path from an entry point (an HTTP handler, a CLI command, an event handler,
  a registered command) down to a named function. The path must be unique; list every function on it.
- `impact`, 3 questions: "If the signature of X changes, which non-test functions call it directly, and which
  functions call those?" Keep the answer to 8 functions or fewer, two levels deep.

Exact:

- 2 config values (a default in a config file, a constant's value), 2 environment variables (where one is
  read: file and function), 2 error messages (the file:line where a given message is raised or logged),
  2 definitions (the file:line where a named class, type or function is defined).

## Prompts

Short, one question, and say what the answer must look like, as v1 did:

    Which functions call diffusion_decode_budget_bytes? Ignore tests. Answer with the caller name and
    file:line of each call site, nothing else.

Always say "Ignore tests" where tests could match. Name things exactly as they appear in the code.

## `must`

The strings a correct answer has to contain, each matched as a whole word, case-insensitively (an entry `init`
is not satisfied by `init_db`). Use function names and file base
names (`blocks.py`), and `file:line` only when the question asks for a line. Do not include anything a
correct answer could phrase differently. Every entry must be checked by reading the code at the pinned commit.

## Rules

- Do not modify, check out, fetch or reindex the repositories in `~/cbm-bench/repos`.
- Find candidates with the graph, verify with `rg` and by reading the code. The graph is approximate (it can
  miss calls through interfaces, aliases or callbacks, and it stores some synthetic nodes), so a `must` list
  never comes from the graph alone.
- Graph from a shell: `printf '%s' '{"project":"<project>","query":"<cypher>"}' | codebase-memory-mcp cli query_graph`.
  Project names are derived from the checkout path (`graph_projects` or `cli list_projects` lists them). Cypher in this version: `count()` aggregation and
  `ORDER BY … LIMIT` work; `STARTS WITH`, `CONTAINS` and `OR` in `WHERE` return nothing, so filter in a script.
  Node properties are `name`, `qualified_name`, `file_path`, `start_line`, `end_line`.
- Do not run `copilot`, `claude -p` or the benchmark drivers, and do not install anything.
- Everything you write is published: English only, no local paths in the JSON or the evidence file (write
  `~/cbm-bench/repos/<dir>` as `<repo>/`).
