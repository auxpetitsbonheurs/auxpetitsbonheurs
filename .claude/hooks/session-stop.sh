#!/usr/bin/env bash
# Stop (async): one-line session log entry.
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
mkdir -p production/session-logs 2>/dev/null || exit 0
changes=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
story=$(grep -m1 '^Active story:' production/session-state/active.md 2>/dev/null | sed 's/^Active story:[[:space:]]*//')
printf '%s stop stage=%s uncommitted=%s story=%s\n' "$(date -u +%FT%TZ)" "$(cfg project.stage)" "$changes" "${story:-none}" >> production/session-logs/sessions.log
exit 0
