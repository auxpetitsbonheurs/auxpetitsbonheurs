#!/usr/bin/env bash
# set-stage.sh <discovery|design|build|launch|grow>
# Writes project.stage and its legacy mirror production/stage.txt.
stage="${1:-}"
case "$stage" in
  discovery|design|build|launch|grow) ;;
  *) echo "usage: set-stage.sh discovery|design|build|launch|grow" >&2; exit 1 ;;
esac
dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "$dir/config-set.sh" "project.stage=$stage"
mkdir -p production && printf '%s\n' "$stage" > production/stage.txt
