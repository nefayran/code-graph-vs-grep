# Benchmark v2: analysis output

Produced by

    python3 bench/stats-v2.py results/v2/claude-haiku-4.5.json results/v2/claude-sonnet-5.json results/v2/claude-opus-5.5.json

Cost is tokenEquiv (uncached input + 1.25 × cache writes + 0.1 × cache reads), per question the median over
repetitions. "ratio" is the median of per-question graph / grep ratios with a bootstrap 95% interval; p is a paired
Wilcoxon signed-rank test, Holm-corrected across the 13 tests. Accuracy intervals are exact binomial.

runs used: 663; left out: {'error': 1}

| model | size | kind | questions | median teq graph | median teq grep | ratio (95% CI) | graph cheaper on | p (Holm) |
|---|---|---|---:|---:|---:|---|---:|---:|
| claude-haiku-4.5 | small | exact | 8 | 11,758 | 13,796 | 0.92 (0.72–1.15) | 4 of 8 | 0.641 (1) |
| claude-haiku-4.5 | small | structural | 8 | 16,076 | 19,582 | 0.88 (0.65–1.29) | 4 of 8 | 0.461 (1) |
| claude-haiku-4.5 | medium | exact | 8 | 10,670 | 13,138 | 0.96 (0.75–1.37) | 5 of 8 | 0.945 (1) |
| claude-haiku-4.5 | medium | structural | 8 | 11,861 | 23,246 | 0.61 (0.11–1.50) | 6 of 8 | 0.25 (1) |
| claude-haiku-4.5 | large | exact | 16 | 24,226 | 26,339 | 1.01 (0.94–1.28) | 7 of 16 | 0.98 (1) |
| claude-haiku-4.5 | large | structural | 16 | 28,192 | 97,480 | 0.29 (0.11–0.70) | 15 of 16 | 0.000427 (0.00555) |
| claude-opus-5.5 | large | structural | 12 | 23,318 | 25,930 | 0.97 (0.72–1.10) | 7 of 12 | 0.339 (1) |
| claude-sonnet-5 | small | exact | 8 | 7,154 | 4,968 | 1.42 (1.20–1.71) | 0 of 8 | 0.00781 (0.0938) |
| claude-sonnet-5 | small | structural | 8 | 14,500 | 9,851 | 1.51 (1.45–1.70) | 1 of 8 | 0.0156 (0.172) |
| claude-sonnet-5 | medium | exact | 8 | 6,523 | 5,307 | 1.14 (1.05–1.30) | 1 of 8 | 0.148 (1) |
| claude-sonnet-5 | medium | structural | 8 | 15,081 | 13,941 | 0.94 (0.57–2.00) | 4 of 8 | 0.641 (1) |
| claude-sonnet-5 | large | exact | 16 | 19,814 | 18,219 | 1.13 (1.01–1.29) | 4 of 16 | 0.105 (1) |
| claude-sonnet-5 | large | structural | 16 | 32,774 | 35,691 | 0.74 (0.62–0.92) | 12 of 16 | 0.105 (1) |

| model | size | kind | correct, graph | correct, grep | teq per correct, graph | teq per correct, grep |
|---|---|---|---|---|---:|---:|
| claude-haiku-4.5 | small | exact | 12/24 (0.29–0.71) | 13/24 (0.33–0.74) | 25,501 | 24,958 |
| claude-haiku-4.5 | small | structural | 13/24 (0.33–0.74) | 19/24 (0.58–0.93) | 33,484 | 25,811 |
| claude-haiku-4.5 | medium | exact | 14/24 (0.37–0.78) | 14/24 (0.37–0.78) | 24,221 | 23,745 |
| claude-haiku-4.5 | medium | structural | 20/24 (0.63–0.95) | 22/24 (0.73–0.99) | 23,741 | 55,294 |
| claude-haiku-4.5 | large | exact | 32/48 (0.52–0.80) | 28/48 (0.43–0.72) | 38,530 | 44,035 |
| claude-haiku-4.5 | large | structural | 38/47 (0.67–0.91) | 33/48 (0.54–0.81) | 47,513 | 208,829 |
| claude-opus-5.5 | large | structural | 12/12 (0.74–1.00) | 12/12 (0.74–1.00) | 25,381 | 26,908 |
| claude-sonnet-5 | small | exact | 14/16 (0.62–0.98) | 16/16 (0.79–1.00) | 8,720 | 4,717 |
| claude-sonnet-5 | small | structural | 13/16 (0.54–0.96) | 15/16 (0.70–1.00) | 18,558 | 10,179 |
| claude-sonnet-5 | medium | exact | 14/16 (0.62–0.98) | 15/16 (0.70–1.00) | 11,599 | 7,507 |
| claude-sonnet-5 | medium | structural | 16/16 (0.79–1.00) | 16/16 (0.79–1.00) | 15,519 | 14,453 |
| claude-sonnet-5 | large | exact | 29/32 (0.75–0.98) | 31/32 (0.84–1.00) | 24,227 | 20,690 |
| claude-sonnet-5 | large | structural | 32/32 (0.89–1.00) | 28/32 (0.71–0.96) | 29,280 | 40,141 |

H4, first model call prompt tokens, graph minus grep, paired per question (median):
  claude-haiku-4.5: small 1,559 (n=16), medium 1,558 (n=16), large 1,558 (n=32)
  claude-opus-5.5: large 2,068 (n=12)
  claude-sonnet-5: small 2,069 (n=16), medium 2,070 (n=16), large 2,069 (n=32)

Per repository (descriptive, no tests):
| model | repository | kind | questions | ratio, median | graph cheaper on | correct, graph | correct, grep | model calls, graph | model calls, grep |
|---|---|---|---:|---:|---:|---|---|---:|---:|
| claude-haiku-4.5 | fastapi-template | exact | 8 | 0.92 | 4 of 8 | 12/24 | 13/24 | 4 | 4 |
| claude-haiku-4.5 | fastapi-template | structural | 8 | 0.88 | 4 of 8 | 13/24 | 19/24 | 6 | 6 |
| claude-haiku-4.5 | dub | exact | 8 | 0.96 | 5 of 8 | 14/24 | 14/24 | 4 | 3 |
| claude-haiku-4.5 | dub | structural | 8 | 0.61 | 6 of 8 | 20/24 | 22/24 | 4 | 7 |
| claude-haiku-4.5 | kubernetes | exact | 8 | 1.18 | 3 of 8 | 16/24 | 14/24 | 5 | 4 |
| claude-haiku-4.5 | kubernetes | structural | 8 | 0.16 | 8 of 8 | 19/23 | 19/24 | 5 | 22 |
| claude-haiku-4.5 | vscode | exact | 8 | 0.98 | 4 of 8 | 16/24 | 14/24 | 4 | 6 |
| claude-haiku-4.5 | vscode | structural | 8 | 0.34 | 7 of 8 | 19/24 | 14/24 | 4 | 20 |
| claude-opus-5.5 | kubernetes | structural | 6 | 0.89 | 3 of 6 | 6/6 | 6/6 | 4 | 5 |
| claude-opus-5.5 | vscode | structural | 6 | 0.97 | 4 of 6 | 6/6 | 6/6 | 4 | 4 |
| claude-sonnet-5 | fastapi-template | exact | 8 | 1.42 | 0 of 8 | 14/16 | 16/16 | 3 | 3 |
| claude-sonnet-5 | fastapi-template | structural | 8 | 1.51 | 1 of 8 | 13/16 | 15/16 | 6 | 6 |
| claude-sonnet-5 | dub | exact | 8 | 1.14 | 1 of 8 | 14/16 | 15/16 | 3 | 3 |
| claude-sonnet-5 | dub | structural | 8 | 0.94 | 4 of 8 | 16/16 | 16/16 | 6 | 5 |
| claude-sonnet-5 | kubernetes | exact | 8 | 1.20 | 0 of 8 | 13/16 | 15/16 | 4 | 2 |
| claude-sonnet-5 | kubernetes | structural | 8 | 0.65 | 6 of 8 | 16/16 | 15/16 | 4 | 8 |
| claude-sonnet-5 | vscode | exact | 8 | 0.99 | 4 of 8 | 16/16 | 16/16 | 4 | 4 |
| claude-sonnet-5 | vscode | structural | 8 | 0.78 | 6 of 8 | 16/16 | 13/16 | 4 | 8 |

premium requests in these runs: 742.39
