#!/usr/bin/env bash
# Clone the benchmark repos at their pinned commits and index each one with codebase-memory-mcp.
#
#   bash bench/setup.sh                            # the three small repositories
#   bash bench/setup.sh bench/questions-large.json # the large one
#
# Repos land in $CBM_BENCH_DIR (default ~/cbm-bench/repos). Keep that directory outside any tree
# that has a CLAUDE.md above it: Claude Code loads CLAUDE.md files from parent directories, and
# instructions about which tools to use would leak into the arm that is supposed to have no graph.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
QUESTIONS="$(cd "$(dirname "${1:-$HERE/questions.json}")" && pwd)/$(basename "${1:-questions.json}")"
DIR="${CBM_BENCH_DIR:-$HOME/cbm-bench/repos}"
BIN="${CBM_BIN:-codebase-memory-mcp}"
mkdir -p "$DIR"

node -e '
  const q = require(process.argv[1]);
  for (const r of Object.values(q.repos)) console.log(`${r.dir} ${r.url} ${r.commit}`);
' "$QUESTIONS" | while read -r dir url sha; do
  if [ ! -d "$DIR/$dir/.git" ]; then
    git init -q "$DIR/$dir"
    git -C "$DIR/$dir" remote add origin "$url"
  fi
  git -C "$DIR/$dir" fetch -q --depth 1 origin "$sha"
  git -C "$DIR/$dir" checkout -q --detach "$sha"
  printf '{"repo_path":"%s","mode":"fast"}' "$DIR/$dir" | "$BIN" cli index_repository > /dev/null
  echo "ready: $dir @ ${sha:0:12}"
done
