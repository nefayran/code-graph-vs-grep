# Benchmark v2: when does a code graph pay off for a coding agent?

Written before any v2 run. Hypotheses, design, budget and analysis are fixed here; anything changed after the
first run is listed under "Changes after start" with the reason.

## Why v2

v1 (`results/`, write-up at allkeep.org/en/lab/code-graph-vs-grep) found no token saving from the graph on
haiku 4.5 and sonnet 5. Its scope was too narrow to say more than that:

- 24 questions: 12 spread over three small repositories (FastAPI template 6, ltx-2-mlx 5, avoid-ai-writing 1)
  and 12 on dub. The v1 write-up says "twelve questions" per repository, which is wrong for the small ones.
- Largest repository 25k graph nodes; no Opus; 2 or 3 repetitions.

v2 asks where the answer changes: at what repository size, for which model, on which kind of question.

## Harness

GitHub Copilot CLI 1.0.90, headless (`copilot -p … --allow-all-tools --output-format json`), with
`--disable-builtin-mcps`. Models: `claude-haiku-4.5`, `claude-sonnet-5`, `claude-opus-5.5`.

v1 ran Claude Code. The two harnesses have different system prompts and tools, so v2 numbers are compared
with each other, not with v1. Measured in the pilot on 2026-10-01: the first model call of a Copilot session
carries about 49k prompt tokens with every built-in tool enabled, and 38k to 40k with only view, grep and
glob (the graph arm's extra tool schemas and guide add about 1.5k).

Each run reads tokens from the session's debug log (`--log-level debug`): one usage block per model call
with `prompt_tokens`, `completion_tokens` and, under `prompt_tokens_details`, `cached_tokens` and
`cache_creation_tokens`. `prompt_tokens` includes both. The cost measure is v1's tokenEquiv, summed over calls:

    tokenEquiv = uncached input + 1.25 * cache writes + 0.1 * cache reads

Output tokens, correctness, wall time, model calls and tool calls are recorded as in v1. The driver is
`bench/run-copilot.mjs`.

## Arms

- **grep**: Copilot's read and search tools only (`--available-tools view grep glob`). Its other built-ins
  (bash, edit, create, web_fetch, task and the rest) are unavailable in both arms, as Bash was in v1.
- **graph**: the same three tools plus the cbm-lean MCP server's tools, and v1's routing guide at the top of
  the prompt (the graph for callers, callees and call chains; grep and view for exact strings). Copilot CLI has
  no flag to append to the system prompt, which is where v1 put the guide. `graph_index` is excluded:
  repositories are indexed before the run.

The raw codebase-memory-mcp server is not repeated: in v1 the wrapper was cheaper than it in every setting
(p ≤ 0.021).

Isolation: repositories live in `~/cbm-bench/repos`, outside any tree with an instruction file above it.
A repository's own CLAUDE.md or AGENTS.md is part of the repository and reaches both arms equally. The pilot
log is checked for every instruction file the CLI loaded.

## Repositories

| size | repository | language | commit | graph nodes |
|---|---|---|---|---:|
| small | fastapi/full-stack-fastapi-template | Python, TypeScript | cb740b65 (as in v1) | 1,601 |
| medium | dubinc/dub | TypeScript | d85e8839 (as in v1) | 25,023 |
| large | kubernetes/kubernetes | Go | 6d805ebe | 146,421 |
| large | microsoft/vscode | TypeScript | ec2e5806 | 218,883 |

Node counts are from a `fast` index with codebase-memory-mcp 0.9.0. django (44,918) and terraform (24,417)
were indexed as candidates and dropped as too small for the large bucket.

## Questions

16 per repository, 64 in all:

- 8 structural: 3 callers or callees, 2 call chains from an entry point, 3 impact questions ("which functions
  break if X changes its signature"), where a graph should help most;
- 8 exact: a config value, an environment variable, an error message, the line a symbol is defined on.

Each question lists the strings a correct answer must contain, checked by hand at the pinned commit. Unlike v1,
an entry has to appear as a whole word (case-insensitive), so `init_db` in an answer does not count for `init`.

## Budget

Copilot charges premium requests per prompt, times the model's multiplier, whatever the number of tool calls
(pilot: 0.33 for haiku, 1 for sonnet, 15 for opus, with and without tool calls).

| model | runs | premium requests |
|---|---|---:|
| haiku 4.5 | 64 questions × 2 arms × 3 repetitions = 384 | ~127 |
| sonnet 5 | 64 × 2 × 2 = 256 | 256 |
| opus 5.5 | 6 structural questions × 2 large repositories × 2 arms × 1 = 24 | 360 |
| total | 664 | ~743 |

The run stops at 800 premium requests.

## Hypotheses

- **H1, size.** For structural questions, the graph-to-grep cost ratio falls as the repository grows; on the
  large repositories the graph is not more expensive than grep.
- **H2, model.** The graph's accuracy gain on structural questions for haiku (v1 on dub: 12/12 against 8/12)
  holds on the large repositories, and is smaller for sonnet and opus.
- **H3, exact questions.** On exact questions grep costs no more than the graph at every size.
- **H4, fixed overhead.** The graph arm's first model call costs more than the grep arm's (tool schemas), and
  this gap does not grow with repository size.

## Analysis

- Per question and arm, the median over repetitions.
- Per model and size bucket, a paired Wilcoxon signed-rank test on cost, with Holm correction across the
  tests reported, and a bootstrap 95% interval for the median cost ratio (graph / grep).
- Accuracy per arm with exact binomial intervals; cost per correct answer.
- Every run, answer and log summary is published, as in v1.

## Changes after start

- 2026-10-01, before the opus run: the budget above gives the opus subset only as "6 structural questions" per
  large repository. They are picked by position in `questions-v2.json`, not by results (part of the haiku round
  was in when this was written): the first two of each structural type, so `callers-1`, `callers-2`, `chain-1`,
  `chain-2`, `impact-1` and `impact-2` on kubernetes and on vscode. `callees-1` and `impact-3` are left out.
- 2026-10-01, a correction to the Harness section, from the haiku runs: the pilot's 49k and 38k to 40k first-call
  figures were measured on ltx-2-mlx, whose 104 KB CLAUDE.md Copilot puts into the system prompt as a
  `<custom_instruction>` block. On the benchmark repositories the first call carries about 3.8k prompt tokens in
  the grep arm and 5.3k in the graph arm (FastAPI template, dub). kubernetes's AGENTS.md adds about 0.6k, and
  vscode's `.github/copilot-instructions.md` and `.github/instructions/` about 12.4k, to both arms alike.
  vscode's file also tells agents to "grep for exact strings: use grep for error messages or specific function
  names", which reaches the graph arm along with v1's routing guide.
- 2026-10-01, during the haiku round: one run (`kubernetes-impact-1`, graph arm, repetition 3) failed before
  Copilot opened a session, and the driver kept only the start of the command line, so the cause is unknown. As
  the analysis section says, it is left out and counted, not rerun. From the sonnet round on, the driver records
  a failed run's exit code, signal, wall time and the end of its stderr.
- 2026-10-01, at the start of the sonnet round: 3 of the first 8 runs failed with "Failed to load models: Model
  catalog request timed out after 30000ms". Copilot exits before it opens a session, so no model is called and
  nothing about the arm is observed. The round was stopped. The driver now waits 60 s and retries such a failure
  up to 4 times, and `--resume` keeps the runs already recorded and runs the rest, catalog failures included. Any
  other failure is still left out and counted, not rerun. One sonnet run that was in flight when the round was
  stopped was lost and is run again. The haiku failure above may have been the same kind, but its stderr was not
  recorded, so it stays left out.
- 2026-10-01, after the last round, in the analysis script: H4 was computed as the difference of pooled medians
  per size bucket. In the large bucket that mixes kubernetes and vscode, whose instruction files differ by about
  12k tokens, and it mixes models whose tokenizers count the same schemas differently, so the pooled medians
  gave a gap of 6.4k that no single question shows. H4 is now paired: per model, repository and question, graph
  minus grep. The script also prints a descriptive table per repository. Nothing else in the analysis changed.
