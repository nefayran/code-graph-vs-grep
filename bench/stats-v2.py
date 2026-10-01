#!/usr/bin/env python3
"""Benchmark v2 analysis, as fixed in PLAN-v2.md.

    python3 bench/stats-v2.py results/v2/*.json

Runs with an error, or that called an MCP tool their arm does not own, are left out and counted. Per question
and arm the median over repetitions is used. For each model, size bucket and kind of question:

- a paired Wilcoxon signed-rank test on tokenEquiv (graph against grep), Holm-corrected across all the tests
  printed;
- the median of per-question cost ratios (graph / grep) with a bootstrap 95% interval over questions;
- accuracy per arm with an exact binomial 95% interval, and tokenEquiv per correct answer.

H4 is read from the first model call's prompt tokens, paired per question. A descriptive table per repository
follows.
"""
import json
import statistics as st
import sys
from collections import defaultdict

import numpy as np
from scipy.stats import binomtest, wilcoxon

BUCKET = {"fastapi-template": "small", "dub": "medium", "kubernetes": "large", "vscode": "large"}
ORDER = ["small", "medium", "large"]


def load(paths):
    runs, dropped = [], defaultdict(int)
    for p in paths:
        for r in json.load(open(p))["runs"]:
            if r.get("error"):
                dropped["error"] += 1
            elif not r.get("valid", True):
                dropped["leaked"] += 1
            else:
                runs.append(r)
    return runs, dropped


def boot_median(vals, n=5000, seed=0):
    rng = np.random.default_rng(seed)
    v = np.array(vals, dtype=float)
    meds = np.median(rng.choice(v, size=(n, len(v)), replace=True), axis=1)
    return float(np.percentile(meds, 2.5)), float(np.percentile(meds, 97.5))


def holm(pvals):
    order = sorted(range(len(pvals)), key=lambda i: pvals[i])
    adj, running = [0.0] * len(pvals), 0.0
    for rank, i in enumerate(order):
        running = max(running, min(1.0, (len(pvals) - rank) * pvals[i]))
        adj[i] = running
    return adj


def main(paths):
    runs, dropped = load(paths)
    print(f"runs used: {len(runs)}; left out: {dict(dropped) or 'none'}\n")
    cells = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
    for r in runs:
        key = (r["model"], BUCKET.get(r["repo"], r["repo"]), r["kind"])
        cells[key][r["id"]][r["arm"]].append(r)

    tests = []
    for key in sorted(cells, key=lambda k: (k[0], ORDER.index(k[1]) if k[1] in ORDER else 9, k[2])):
        qs = cells[key]
        pairs = [(st.median(x["tokenEquiv"] for x in a["graph"]), st.median(x["tokenEquiv"] for x in a["grep"]))
                 for a in qs.values() if a.get("graph") and a.get("grep")]
        if len(pairs) < 2:
            continue
        g, n = zip(*pairs)
        diff = [a - b for a, b in pairs]
        p = wilcoxon(g, n).pvalue if any(diff) else 1.0
        ratios = [a / b for a, b in pairs]
        lo, hi = boot_median(ratios)
        acc = {}
        for arm in ("graph", "grep"):
            rs = [x for a in qs.values() for x in a.get(arm, [])]
            k = sum(1 for x in rs if x["correct"])
            ci = binomtest(k, len(rs)).proportion_ci() if rs else None
            per_correct = sum(x["tokenEquiv"] for x in rs) / k if k else float("inf")
            acc[arm] = (k, len(rs), ci, per_correct)
        tests.append(dict(key=key, n=len(pairs), g=st.median(g), b=st.median(n), ratio=st.median(ratios),
                          ci=(lo, hi), p=p, graph_wins=sum(1 for d in diff if d < 0), acc=acc))

    for t, padj in zip(tests, holm([t["p"] for t in tests])):
        t["padj"] = padj

    print("| model | size | kind | questions | median teq graph | median teq grep | ratio (95% CI) | graph cheaper on | p (Holm) |")
    print("|---|---|---|---:|---:|---:|---|---:|---:|")
    for t in tests:
        m, b, k = t["key"]
        print(f"| {m} | {b} | {k} | {t['n']} | {t['g']:,.0f} | {t['b']:,.0f} | {t['ratio']:.2f} ({t['ci'][0]:.2f}–{t['ci'][1]:.2f}) "
              f"| {t['graph_wins']} of {t['n']} | {t['p']:.3g} ({t['padj']:.3g}) |")

    print("\n| model | size | kind | correct, graph | correct, grep | teq per correct, graph | teq per correct, grep |")
    print("|---|---|---|---|---|---:|---:|")
    for t in tests:
        m, b, k = t["key"]
        cells_ = []
        for arm in ("graph", "grep"):
            c, total, ci, _ = t["acc"][arm]
            cells_.append(f"{c}/{total} ({ci.low:.2f}–{ci.high:.2f})" if ci else "–")
        pc = [t["acc"][arm][3] for arm in ("graph", "grep")]
        print(f"| {m} | {b} | {k} | {cells_[0]} | {cells_[1]} | {pc[0]:,.0f} | {pc[1]:,.0f} |")

    # H4 is paired: per model, repository and question, the graph arm's first-call prompt minus the grep arm's
    # (medians over repetitions). A difference of pooled medians mixes repositories whose own instruction files
    # differ by 12k tokens, and models whose tokenizers count the same schemas differently.
    print("\nH4, first model call prompt tokens, graph minus grep, paired per question (median):")
    gaps = defaultdict(list)
    by_q = defaultdict(lambda: defaultdict(list))
    for r in runs:
        if r.get("firstCallPrompt"):
            by_q[(r["model"], r["repo"], r["id"])][r["arm"]].append(r["firstCallPrompt"])
    for (m, repo, _), arms in by_q.items():
        if arms.get("graph") and arms.get("grep"):
            gaps[(m, BUCKET.get(repo, repo))].append(st.median(arms["graph"]) - st.median(arms["grep"]))
    for m in sorted({k[0] for k in gaps}):
        row = [f"{b} {st.median(gaps[(m, b)]):,.0f} (n={len(gaps[(m, b)])})" for b in ORDER if gaps.get((m, b))]
        print(f"  {m}: " + ", ".join(row))

    print("\nPer repository (descriptive, no tests):")
    print("| model | repository | kind | questions | ratio, median | graph cheaper on | correct, graph | correct, grep | model calls, graph | model calls, grep |")
    print("|---|---|---|---:|---:|---:|---|---|---:|---:|")
    per = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
    for r in runs:
        per[(r["model"], r["repo"], r["kind"])][r["id"]][r["arm"]].append(r)
    for key in sorted(per, key=lambda k: (k[0], ORDER.index(BUCKET.get(k[1], "large")), k[1], k[2])):
        qs = per[key]
        both = [a for a in qs.values() if a.get("graph") and a.get("grep")]
        ratios = [st.median(x["tokenEquiv"] for x in a["graph"]) / st.median(x["tokenEquiv"] for x in a["grep"]) for a in both]
        calls = {arm: st.median(st.median(x["modelCalls"] for x in a[arm]) for a in both) for arm in ("graph", "grep")}
        acc = {arm: (sum(x["correct"] for a in qs.values() for x in a.get(arm, [])),
                     sum(len(a.get(arm, [])) for a in qs.values())) for arm in ("graph", "grep")}
        print(f"| {key[0]} | {key[1]} | {key[2]} | {len(both)} | {st.median(ratios):.2f} | {sum(x < 1 for x in ratios)} of {len(both)} "
              f"| {acc['graph'][0]}/{acc['graph'][1]} | {acc['grep'][0]}/{acc['grep'][1]} | {calls['graph']:.0f} | {calls['grep']:.0f} |")

    pr = sum(r.get("premiumRequests", 0) for r in runs)
    print(f"\npremium requests in these runs: {pr:.2f}")


if __name__ == "__main__":
    main(sys.argv[1:])
