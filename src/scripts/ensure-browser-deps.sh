#!/usr/bin/env bash
# Installs Chromium's system libraries only when the runner image lacks one, retrying apt.
# `playwright install --with-deps` always runs `apt-get update`; CI runs 43031233818 and
# 43039279359 failed there on an Ubuntu mirror DNS outage before any test ran. The browser
# download itself does not use apt. Run after `npx playwright install chromium`.
set -euo pipefail

root="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"
install_cmd="${INSTALL_DEPS_CMD:-npx playwright install-deps chromium}"
delay="${RETRY_DELAY:-20}"

missing_libs() {
  local bin found=0
  while IFS= read -r bin; do
    found=1
    ldd "$bin" 2>&1 | grep 'not found' || true
  done < <(find "$root" -type f \( -name chrome -o -name headless_shell \) 2>/dev/null)
  if [ "$found" -eq 0 ]; then
    echo "No Chromium binary under $root; run 'npx playwright install chromium' first." >&2
    return 2
  fi
}

missing="$(missing_libs)" || exit 1
if [ -z "$missing" ]; then
  echo "Chromium's system libraries are present; skipping apt."
  exit 0
fi

echo "Missing system libraries:" >&2
echo "$missing" >&2
for attempt in 1 2 3; do
  echo "Installing system libraries (attempt $attempt of 3)"
  # shellcheck disable=SC2086 # the command is deliberately word-split
  if $install_cmd; then exit 0; fi
  [ "$attempt" -lt 3 ] && sleep "$delay"
done
echo "::error::Could not install Chromium's system libraries after 3 attempts" >&2
exit 1
