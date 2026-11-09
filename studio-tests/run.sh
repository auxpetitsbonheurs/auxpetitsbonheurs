#!/usr/bin/env bash
# Studio self-tests. Usage: bash studio-tests/run.sh [all|lint|hooks|scripts|agents|skills|skill <name>]
set -u
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
case "${1:-all}" in
  hooks)   bash "$here/hooks.sh" ;;
  scripts) bash "$here/scripts.sh" ;;
  lint)    python3 "$here/lint.py" all ;;
  agents|skills|rules|templates) python3 "$here/lint.py" "$1" ;;
  skill)   python3 "$here/lint.py" skill "${2:?skill name}" ;;
  all)
    rc=0
    for f in "$here"/../.claude/hooks/*.sh "$here"/../.claude/scripts/*.sh "$here"/../.claude/statusline.sh; do
      bash -n "$f" || { echo "SYNTAX ERROR: $f"; rc=1; }
    done
    python3 "$here/lint.py" all || rc=1
    bash "$here/scripts.sh" || rc=1
    bash "$here/hooks.sh" || rc=1
    [ $rc -eq 0 ] && echo "studio-tests: ALL PASSED" || echo "studio-tests: FAILURES"
    exit $rc ;;
  *) echo "usage: run.sh [all|lint|hooks|scripts|agents|skills|skill <name>]"; exit 2 ;;
esac
