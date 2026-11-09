#!/usr/bin/env bash
# PreToolUse(Bash) on `git push`: warn on pushing to main; run unit tests
# (block on failure under full rigor, warn under standard, skip under minimal).
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
cmd="$(json_get .tool_input.command)"
printf '%s' "$cmd" | grep -qE '(^|[;&|[:space:]])git([[:space:]]+-[^[:space:]]+)*[[:space:]]+push([[:space:]]|$)' || exit 0
notes=""
branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
# Target: an explicit refspec after the remote wins; otherwise the current branch.
target="$(printf '%s' "$cmd" | sed -E 's/.*git([[:space:]]+-[^[:space:]]+)*[[:space:]]+push//' | tr ' ' '\n' | grep -vE '^-|^$' | sed -n 2p)"
target="${target##*:}"; target="${target:-$branch}"
if printf '%s' "$target" | grep -qxE '(main|master|production|HEAD:main)'; then
  notes="Pushing to a protected-looking branch ($target). Prefer a feature branch + PR. "
fi
[ "$RIGOR" = minimal ] && { [ -n "$notes" ] && advise PreToolUse "$notes"; exit 0; }
res="$(bash "$WS_SCRIPTS/test-run.sh" unit 2>/dev/null)"
case "$(printf '%s\n' "$res" | sed -n 's/^result: //p')" in
  fail)
    m="${notes}unit tests fail; fix them before pushing.
$(printf '%s\n' "$res" | tail -15)"
    [ "$STRICT" = all ] && block "$m"
    advise PreToolUse "$m" ;;
  runner-error)
    m="${notes}the test runner failed to start (broken test setup, e.g. a missing peer dependency), so tests did not run.
$(printf '%s\n' "$res" | grep -m3 -E 'Error|Cannot find')"
    [ "$STRICT" = all ] && block "$m"
    advise PreToolUse "$m" ;;
  runner-missing) advise PreToolUse "${notes}the test runner is not installed, so tests were not run (/test-setup)." ;;
  *) [ -n "$notes" ] && advise PreToolUse "$notes" ;;
esac
exit 0
