#!/usr/bin/env bash
# PostToolUse(Write|Edit): source logic changed but no matching test exists.
# minimal: silent · standard: advise · full: Claude must add the test.
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
[ "$RIGOR" = minimal ] && exit 0
tdd="$(cfg quality.tdd)"; [ "$tdd" = off ] && exit 0
f="$(hook_file)"; [ -z "$f" ] && exit 0
is_source_file "$f" || exit 0
is_test_file "$f" && exit 0
case "$f" in */components/ui/*|*/layout.*|*/page.*|*/loading.*|*/error.*|*/not-found.*|*/+layout.*|*/index.astro|*.astro|*/types.*|*/constants.*|*/env.*|*/routes.*) exit 0 ;; esac
base="$(basename "$f")"; stem="${base%.*}"; stem="${stem%.server}"
[ ${#stem} -lt 3 ] && exit 0
found="$(find . \( -path ./node_modules -o -path ./.git -o -path ./.next -o -path ./dist \) -prune -o -type f \
  \( -name "${stem}.test.*" -o -name "${stem}.spec.*" -o -name "test_${stem}.py" -o -name "${stem}_test.py" -o -name "${stem}_test.go" -o -name "${stem}Test.php" -o -name "${stem}_spec.rb" \) -print 2>/dev/null | head -1)"
[ -n "$found" ] && exit 0
msg="TDD: '$f' changed but no test named like '${stem}.test.*' exists. Write the failing test for the acceptance criterion first (/tdd), or say why this file needs none."
if [ "$RIGOR" = full ] || [ "$tdd" = required ]; then block "$msg"; fi
advise PostToolUse "$msg"
