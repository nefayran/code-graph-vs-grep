#!/usr/bin/env python3
# Significance for the cost claims instead of eyeballing medians.
#
#   python3 bench/stats.py results/<file>.json [more files ...]
#
# The design is paired by question: every question runs under every arm, so "arm A is cheaper
# than arm B" is tested with a Wilcoxon signed-rank test over per-question medians. That keeps the
# pairing and assumes nothing about the (very skewed) token distribution. Each arm also gets a
# bootstrap 95% CI on its per-run median, so the noise in the median is a number.
# Runs marked invalid (an MCP tool outside the arm leaked in) and errored runs are dropped.
import json
import statistics as st
import sys

import numpy as np
from scipy.stats import mannwhitneyu, wilcoxon

RNG = np.random.default_rng(0)
ARMS = ["graph", "rawgraph", "nograph"]
PAIRS = [("graph", "nograph"), ("graph", "rawgraph"), ("rawgraph", "nograph")]


def load(path):
    data = json.load(open(path))
    runs = data["runs"] if isinstance(data, dict) else data
    model = data.get("meta", {}).get("model", path) if isinstance(data, dict) else path
    return model, [r for r in runs if not r.get("error") and r.get("valid", True)]


def med(v):
    return st.median(v) if v else float("nan")


def boot_ci(vals, n=5000):
    vals = np.array(vals, float)
    meds = [np.median(RNG.choice(vals, len(vals), replace=True)) for _ in range(n)]
    return np.percentile(meds, 2.5), np.percentile(meds, 97.5)


def paired(rows, a, b):
    xa, xb = [], []
    for q in sorted({r["id"] for r in rows}):
        va = [r["tokenEquiv"] for r in rows if r["arm"] == a and r["id"] == q]
        vb = [r["tokenEquiv"] for r in rows if r["arm"] == b and r["id"] == q]
        if va and vb:
            xa.append(med(va))
            xb.append(med(vb))
    cheaper = sum(x < y for x, y in zip(xa, xb))
    try:
        p = wilcoxon(xa, xb).pvalue
    except ValueError:
        p = float("nan")
    return cheaper, len(xa), p


for path in sys.argv[1:]:
    model, rows = load(path)
    print(f"\n===== {model}  ({len(rows)} valid runs) =====")
    for arm in ARMS:
        te = [r["tokenEquiv"] for r in rows if r["arm"] == arm]
        if not te:
            continue
        lo, hi = boot_ci(te)
        ok = sum(r["correct"] for r in rows if r["arm"] == arm)
        turns = med([r["turns"] for r in rows if r["arm"] == arm])
        print(f"  {arm:<9} tokenEquiv median {int(med(te)):>7}  95% CI [{int(lo)}, {int(hi)}]  "
              f"turns median {turns}  correct {ok}/{len(te)}")
    for kind in ("structural", "exact"):
        parts = []
        for arm in ARMS:
            sub = [r for r in rows if r["arm"] == arm and r["kind"] == kind]
            if sub:
                parts.append(f"{arm} {sum(r['correct'] for r in sub)}/{len(sub)}")
        print(f"  correct on {kind:<10}: " + ", ".join(parts))
    print("  paired over questions (Wilcoxon):")
    for a, b in PAIRS:
        cheaper, n, p = paired(rows, a, b)
        print(f"    {a} cheaper than {b} on {cheaper}/{n} questions, p={p:.3f}"
              + ("  significant" if p < 0.05 else "  not significant"))
    print("  unpaired per run (Mann-Whitney, one-sided):")
    for a, b in PAIRS:
        va = [r["tokenEquiv"] for r in rows if r["arm"] == a]
        vb = [r["tokenEquiv"] for r in rows if r["arm"] == b]
        if va and vb:
            p = mannwhitneyu(va, vb, alternative="less").pvalue
            print(f"    {a} < {b}: median {int(med(va))} vs {int(med(vb))}, p={p:.3f}")
