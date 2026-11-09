#!/usr/bin/env bash
# PostToolUse(Write|Edit) on a skill or agent: remind to self-test.
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
f="$(hook_file)"
case "$f" in
  .claude/skills/*/SKILL.md) n="${f#.claude/skills/}"; n="${n%%/*}"; advise PostToolUse "skill '$n' changed: run /skill-test $n (or bash studio-tests/run.sh skill $n)." ;;
  .claude/agents/*.md) advise PostToolUse "agent '$(basename "$f" .md)' changed: run bash studio-tests/run.sh agents." ;;
esac
exit 0
