#!/usr/bin/env bash
# PreToolUse(Bash) on `git commit`: conventional message, no secrets/.env staged,
# no huge files; under full rigor also runs the project's lint + typecheck scripts.
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
cmd="$(json_get .tool_input.command)"
printf '%s' "$cmd" | grep -qE '(^|[;&|[:space:]])git([[:space:]]+-[^[:space:]]+)*[[:space:]]+commit([[:space:]]|$)' || exit 0

# 1. Staged env/key files — always blocked.
staged="$(git diff --cached --name-only 2>/dev/null)"
bad="$(printf '%s\n' "$staged" | grep -E '(^|/)\.env($|\.)|\.pem$|\.key$|(^|/)(secrets|credentials)\.json$' | grep -vE '\.env\.(example|sample|template)$')"
[ -n "$bad" ] && block "staged files must not be committed: $(printf '%s' "$bad" | paste -sd ', ' -). Unstage them (git restore --staged <file>) and make sure .gitignore covers them."

# 2. Secrets in the staged diff — always blocked.
hits="$(git diff --cached -U0 2>/dev/null | grep -E '^\+' | grep -oE "$SECRET_RE" \
  | grep -vE '@(localhost|127\.0\.0\.1|db|postgres|mysql|mongo|redis)([:/]|$)' | grep -viE '(xxxx|your[_-]|[_-]example|example[_-]|placeholder|changeme)' | head -3)"
[ -n "$hits" ] && block "the staged diff contains what looks like a secret ($(printf '%s\n' "$hits" | sed -E 's/^(.{6}).*/\1…/' | paste -sd ', ' -)). Remove it, rotate it if it was ever pushed, and load it from the environment."

# 3. Large files (> 5 MB).
while IFS= read -r p; do
  [ -f "$p" ] || continue
  s=$(wc -c < "$p" | tr -d ' ')
  [ "$s" -gt 5242880 ] && report PreToolUse "'$p' is $((s / 1048576)) MB. Large binaries belong in object storage or Git LFS."
done <<< "$staged"

# 4. Conventional commit message. Only the text after `git commit` counts, so a
#    compound command (heredocs, scripts before the commit) is not misread.
commit_part="$(printf '%s' "$cmd" | awk 'f {print; next} /git([[:space:]]+-[^[:space:]]+)*[[:space:]]+commit/ {sub(/.*git([[:space:]]+-[^[:space:]]+)*[[:space:]]+commit/, ""); f=1; print}')"
msg=""
if command -v python3 >/dev/null 2>&1; then
  msg="$(printf '%s' "$commit_part" | python3 "$HOOK_LIB_DIR/commit-msg.py" 2>/dev/null)"
else
  msg="$(printf '%s' "$commit_part" | sed -nE "s/.*-m[[:space:]]*[\"']([^\"']*).*/\1/p" | head -1)"
fi
if [ -n "$msg" ] && ! printf '%s' "$msg" | head -1 | grep -qE '^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9._/-]+\))?!?: .+'; then
  m="commit message should follow Conventional Commits, e.g. 'feat(auth): add magic-link sign-in'. Got: '$(printf '%s' "$msg" | head -1 | cut -c1-72)'"
  [ "$STRICT" = warn ] && advise PreToolUse "$m"
  block "$m"
fi

# 5. Full rigor: lint + typecheck scripts if the project defines them.
if [ "$STRICT" = all ] && [ -f package.json ]; then
  pm="$(cfg stack.package_manager)"; pm="${pm:-npm}"
  for s in lint typecheck; do
    grep -q "\"$s\"[[:space:]]*:" package.json || continue
    out="$(timeout 120 $pm run -s "$s" 2>&1)" || block "'$pm run $s' failed; fix before committing:
$(printf '%s\n' "$out" | tail -20)"
  done
fi
exit 0
