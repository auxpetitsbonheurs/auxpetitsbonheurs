#!/usr/bin/env bash
# SessionStart: print a short project briefing into the session context.
# Output is advisory; this hook never blocks.
cd "${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}" 2>/dev/null || exit 0
WS_SCRIPTS="$(cd "$(dirname "${BASH_SOURCE[0]}")/../scripts" && pwd)"
get() { bash "$WS_SCRIPTS/yaml-get.sh" "$1" 2>/dev/null; }

name=$(get project.name); stage=$(get project.stage); rigor=$(get modes.rigor)
fe=$(get stack.frontend); be=$(get stack.backend); db=$(get stack.database); host=$(get stack.hosting)

echo "=== Claude Code Web Studios ==="
echo "Project: ${name:-<unnamed>} | Stage: ${stage:-not set} | Rigor: ${rigor:-not set}"
if [ -n "$fe$be$db$host" ]; then
  echo "Stack: frontend=${fe:-?} backend=${be:-?} database=${db:-?} hosting=${host:-?}"
else
  echo "Stack: not configured. New here? Run /start."
fi

branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
[ -n "$branch" ] && echo "Branch: $branch ($(git status --porcelain 2>/dev/null | wc -l | tr -d ' ') uncommitted changes)"

state=production/session-state/active.md
if [ -f "$state" ]; then
  echo ""
  echo "--- Session checkpoint ($state) — resume from here ---"
  head -40 "$state"
  echo "--- end checkpoint ---"
fi
exit 0
