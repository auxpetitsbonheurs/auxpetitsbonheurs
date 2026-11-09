#!/usr/bin/env bash
# PostToolUse(Write|Edit) on dependency manifests: note new deps; under full
# rigor run a quick local audit (high/critical only).
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
f="$(hook_file)"
case "$f" in package.json|*/package.json|requirements*.txt|pyproject.toml|go.mod|composer.json|Gemfile) ;; *) exit 0 ;; esac
added="$(git diff -U0 -- "$f" 2>/dev/null | grep -E '^\+[[:space:]]*"[@a-z0-9._/-]+"[[:space:]]*:[[:space:]]*"[~^0-9*]' | sed -E 's/^\+[[:space:]]*"([^"]+)".*/\1/' | paste -sd ', ' -)"
if git ls-files --error-unmatch -- "$f" >/dev/null 2>&1 && git diff --quiet -- "$f" 2>/dev/null; then exit 0; fi
msg="dependency manifest '$f' changed."
[ -n "$added" ] && msg="$msg New/changed packages: $added. Check each is maintained, widely used, licence-compatible and has no install scripts you did not expect."
if [ "$RIGOR" = full ] && [ "$(basename "$f")" = package.json ] && [ -f package-lock.json -o -f pnpm-lock.yaml ]; then
  pm="$(cfg stack.package_manager)"; pm="${pm:-npm}"
  out="$(timeout 25 $pm audit --audit-level=high 2>&1 | tail -8)" && msg="$msg Audit: no high/critical advisories." || msg="$msg Audit output:
$out"
fi
advise PostToolUse "$msg Run /dependency-audit for the full report."
