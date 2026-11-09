#!/usr/bin/env bash
# PreCompact: keep the checkpoint in view across compaction.
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
s=production/session-state/active.md
echo "Before compacting: make sure $s records what you are doing, what is done, what is next and open questions (format in .claude/docs/skill-conventions.md). After compaction, read it first."
[ -f "$s" ] && { echo "--- current $s ---"; head -60 "$s"; }
exit 0
