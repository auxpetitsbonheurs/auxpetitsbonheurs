#!/usr/bin/env bash
# Deploy preflight (S-002): checks that the named GitHub Actions secrets reached this job
# as environment variables of the same name. Prints names only, never values.
# - none set: the keys are not configured yet -> notice, configured=false, exit 0 (CI stays green)
# - some set: a half-configured deploy -> error naming the missing ones, exit 1
# - all set:  configured=true
# Usage: scripts/check-deploy-keys.sh NAME [NAME...]   (writes to $GITHUB_OUTPUT)
set -euo pipefail

missing=()
for name in "$@"; do
  if [ -z "${!name:-}" ]; then missing+=("$name"); fi
done

out="${GITHUB_OUTPUT:-/dev/stdout}"
if [ "${#missing[@]}" -eq "$#" ]; then
  echo "::notice::Deploy skipped: GitHub Actions secrets $* are not configured yet. See docs/runbooks/deploy-keys.md."
  echo "configured=false" >> "$out"
elif [ "${#missing[@]}" -gt 0 ]; then
  echo "::error::Deploy refused: missing GitHub Actions secrets ${missing[*]}. See docs/runbooks/deploy-keys.md."
  exit 1
else
  echo "configured=true" >> "$out"
fi
