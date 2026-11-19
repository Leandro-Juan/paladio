#!/usr/bin/env bash
set -euo pipefail

# Allow intentional demo edits via explicit opt-in
if [ "${ALLOW_DEMO_COMMIT:-0}" = "1" ]; then
  exit 0
fi

BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || true)
if [ "$BRANCH" != "demo" ]; then
  exit 0
fi

# Always allow merge commits (e.g. resolving main -> demo sync conflicts)
GIT_DIR=$(git rev-parse --git-dir)
if [ -f "$GIT_DIR/MERGE_HEAD" ]; then
  exit 0
fi

cat >&2 <<'EOF'
ERROR: Direct commits on the 'demo' branch are blocked by default.
All regular development belongs on 'main' — GitHub Actions (.github/workflows/sync-demo.yml)
automatically merges main into demo on every push.

To make an intentional Demo Mode change, re-run with:
  ALLOW_DEMO_COMMIT=1 git commit ...

To resolve a main -> demo merge conflict, run:
  git merge origin/main && git commit -s
(Merge commits are automatically permitted.)
EOF
exit 1
