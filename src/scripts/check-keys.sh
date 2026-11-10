#!/usr/bin/env bash
# Checks that the named GitHub Actions secrets reached this job as environment variables of
# the same name. Prints names only, never values. Writes configured=true|false to $GITHUB_OUTPUT.
#
# Default (deploys, S-002):
# - none set: the keys are not configured yet -> notice, configured=false, exit 0 (stays green)
# - some set: a half-configured deploy -> error naming the missing ones, exit 1
# - all set:  configured=true
# --require (backups, S-020): any missing -> error naming them, exit 1 (never a silent success)
#
# Usage: scripts/check-keys.sh [--require] NAME [NAME...]
set -euo pipefail

require=false
if [ "${1:-}" = "--require" ]; then require=true; shift; fi

missing=()
for name in "$@"; do
  if [ -z "${!name:-}" ]; then missing+=("$name"); fi
done

out="${GITHUB_OUTPUT:-/dev/stdout}"
if [ "${#missing[@]}" -gt 0 ] && { [ "$require" = true ] || [ "${#missing[@]}" -lt "$#" ]; }; then
  echo "::error::Missing GitHub Actions secrets: ${missing[*]}. See docs/runbooks/deploy-keys.md."
  exit 1
elif [ "${#missing[@]}" -gt 0 ]; then
  echo "::notice::Deploy skipped: GitHub Actions secrets $* are not configured yet. See docs/runbooks/deploy-keys.md."
  echo "configured=false" >> "$out"
else
  echo "configured=true" >> "$out"
fi
