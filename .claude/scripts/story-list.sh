#!/usr/bin/env bash
# story-list.sh [status] — prints `id|status|estimate|path` for every story
# under production/stories/, optionally filtered by status.
want="${1:-}"
cd "${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}" 2>/dev/null || true
[ -d production/stories ] || exit 0
find production/stories -type f -name 'S-*.md' | sort | while read -r f; do
  id=$(basename "$f" | grep -oE '^S-[0-9]+')
  st=$(grep -m1 -E '^Status:' "$f" | sed 's/^Status:[[:space:]]*//; s/[[:space:]]*#.*$//')
  est=$(grep -m1 -E '^Estimate:' "$f" | sed 's/^Estimate:[[:space:]]*//; s/[[:space:]]*#.*$//')
  [ -n "$want" ] && [ "$st" != "$want" ] && continue
  echo "${id}|${st:-unknown}|${est:-?}|$f"
done
