#!/usr/bin/env bash
# PreToolUse(Write|Edit): block secrets and .env files. Always on, every rigor.
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
f="$(hook_file)"; [ -z "$f" ] && exit 0
case "$f" in
  .env.example|*/.env.example|.env.sample|*/.env.sample|.env.template|*/.env.template) ;;
  .env|.env.*|*/.env|*/.env.*) block "refusing to write '$f'. Real env files hold secrets; put placeholders in .env.example and let the user fill .env themselves." ;;
  *.pem|*.key|*/secrets.json|secrets.json|*/credentials.json|credentials.json) block "refusing to write key/credential file '$f'." ;;
esac
hits="$(hook_content | grep -oE "$SECRET_RE" 2>/dev/null \
  | grep -vE '@(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|mysql|mongo|redis|host\.docker\.internal)([:/]|$)' \
  | grep -viE '(xxxx|your[_-]|[_-]example|example[_-]|placeholder|changeme|<[^>]+>)' | head -3)"
if [ -n "$hits" ]; then
  masked="$(printf '%s\n' "$hits" | sed -E 's/^(.{6}).*/\1…(redacted)/' | paste -sd ', ' -)"
  block "the content for '$f' contains what looks like a real secret ($masked). Read it from an environment variable instead, and document the variable in .env.example with a placeholder."
fi
exit 0
