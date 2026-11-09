#!/usr/bin/env bash
# PostToolUse(Write|Edit): OWASP-style code smells. Heuristic; /security-audit goes deeper.
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
f="$(hook_file)"; [ -z "$f" ] && exit 0
is_source_file "$f" || case "$f" in *.html|*.sql) ;; *) exit 0 ;; esac
[ -f "$f" ] || exit 0
is_test_file "$f" && exit 0
issues=""; add() { issues="${issues}
- $1"; }
chk() { local l; l="$(grep -nE "$1" "$f" 2>/dev/null | cut -d: -f1 | head -3 | paste -sd, -)"; [ -n "$l" ] && add "$2 (line $l)"; }
chk 'dangerouslySetInnerHTML|v-html=|\{@html |innerHTML[[:space:]]*=|\[innerHTML\]|html_safe|\|safe\b|raw\(' "raw HTML injection point: sanitise (DOMPurify) or render as text"
chk '(^|[^A-Za-z_.])eval\(|new Function\(' "eval/new Function executes strings as code"
chk '(query|execute|raw|\$queryRawUnsafe|\$executeRawUnsafe|sql\.raw)\([[:space:]]*[`"'"'"'][^`"'"'"']*(\$\{|" *\+|'"'"' *\+)' "SQL built from strings: use parameters / tagged templates"
chk 'f"(SELECT|INSERT|UPDATE|DELETE)|\.format\(.*(SELECT|INSERT|UPDATE|DELETE)' "SQL built with string formatting"
chk "origin:[[:space:]]*['\"]\*['\"]|Access-Control-Allow-Origin['\"]?[,:][[:space:]]*['\"]\*" "CORS allows any origin: use an allowlist"
chk 'rejectUnauthorized:[[:space:]]*false|verify[[:space:]]*=[[:space:]]*False|InsecureSkipVerify:[[:space:]]*true|NODE_TLS_REJECT_UNAUTHORIZED' "TLS verification disabled"
chk '(NEXT_PUBLIC|VITE|PUBLIC|NUXT_PUBLIC|EXPO_PUBLIC)_[A-Z_]*(SECRET|PRIVATE|SERVICE_ROLE|PASSWORD)' "secret-looking variable exposed to the browser via a public env prefix"
chk '(exec|execSync|spawn)\([[:space:]]*`[^`]*\$\{' "shell command built from interpolation: use execFile/spawn with an args array"
chk 'jwt\.decode\(' "jwt.decode does not verify signatures: use verify"
chk 'Math\.random\(\).*(token|secret|password|otp|code)' "Math.random is not cryptographically secure: use crypto.randomUUID/getRandomValues"
chk 'httpOnly:[[:space:]]*false|secure:[[:space:]]*false' "cookie without HttpOnly/Secure"
[ -z "$issues" ] && exit 0
[ "$STRICT" = warn ] && advise PostToolUse "security check for '$f':$issues"
report PostToolUse "security check for '$f':$issues
(If a match is intentional and safe, say why in a code comment.)"
