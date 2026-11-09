#!/usr/bin/env bash
# SubagentStart: append to the agent audit trail (gitignored).
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
mkdir -p production/session-logs 2>/dev/null || exit 0
a="$(json_get .agent_type)"; [ -z "$a" ] && a="$(json_get .subagent_type)"
printf '%s start %s session=%s\n' "$(date -u +%FT%TZ)" "${a:-unknown}" "$(json_get .session_id | cut -c1-8)" >> production/session-logs/agents.log
exit 0
