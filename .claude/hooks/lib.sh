#!/usr/bin/env bash
# Shared helpers for Web Studios hooks. Source it; do not run it.
# Hooks fail OPEN: if input cannot be parsed, they exit 0 rather than block work.

HOOK_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WS_SCRIPTS="$HOOK_LIB_DIR/../scripts"   # works for template and plugin installs
HOOK_ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$HOOK_ROOT" 2>/dev/null || exit 0
HOOK_INPUT="$(cat 2>/dev/null)"

# Windows: `python3` can be the Microsoft Store stub, which exists but cannot run.
if ! python3 -c '' >/dev/null 2>&1 && python -c '' >/dev/null 2>&1; then
  python3() { python "$@"; }
fi

# json_get <jq-path>  e.g. json_get .tool_input.command
json_get() {
  if command -v jq >/dev/null 2>&1; then
    # jq.exe ends lines with CRLF on Windows; a stray \r breaks later matching.
    printf '%s' "$HOOK_INPUT" | jq -r "$1 // empty" 2>/dev/null | tr -d '\r'
  elif command -v python3 >/dev/null 2>&1; then
    printf '%s' "$HOOK_INPUT" | python3 -c '
import json,sys
p=[k for k in sys.argv[1].strip(".").split(".") if k]
try:
    v=json.load(sys.stdin)
    for k in p: v=v.get(k) if isinstance(v,dict) else None
    if v is None: v=""
    print(v if isinstance(v,str) else json.dumps(v))
except Exception: pass' "$1" 2>/dev/null
  fi
}

cfg() { bash "$WS_SCRIPTS/yaml-get.sh" "$1" 2>/dev/null; }

# rigor: minimal | standard | full (default standard)
RIGOR="$(cfg modes.rigor)"; RIGOR="${RIGOR:-standard}"
STRICT="$(cfg quality.hook_strictness)"
if [ -z "$STRICT" ]; then
  case "$RIGOR" in minimal) STRICT=warn ;; full) STRICT=all ;; *) STRICT=secrets ;; esac
fi

# Repo-relative path of the file a Write/Edit/Read touches
hook_file() {
  local f root; f="$(json_get .tool_input.file_path)"
  [ -z "$f" ] && return
  f="${f//\\//}"
  # On Windows the project root may appear as C:\x, C:/x or /c/x.
  for root in "${HOOK_ROOT//\\//}" "$PWD" "$(pwd -W 2>/dev/null)"; do
    [ -n "$root" ] || continue
    case "$f" in "$root"/*) printf '%s' "${f#"$root"/}"; return ;; esac
  done
  case "$f" in /*|[A-Za-z]:/*) return ;; esac   # outside the project: not ours to check
  printf '%s' "$f"
}

# Text a Write/Edit is putting into the file
hook_content() {
  json_get .tool_input.content
  json_get .tool_input.new_string
  json_get .tool_input.edits
}

# block <msg>: PreToolUse → stop the tool call. PostToolUse → feedback Claude must act on.
block() { printf 'Web Studios hook: %s\n' "$1" >&2; exit 2; }

# advise <event> <msg>: non-blocking note added to Claude's context.
advise() {
  local ev="$1" msg="Web Studios hook: $2"
  if command -v jq >/dev/null 2>&1; then
    jq -cn --arg e "$ev" --arg m "$msg" '{hookSpecificOutput:{hookEventName:$e,additionalContext:$m}}'
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c 'import json,sys;print(json.dumps({"hookSpecificOutput":{"hookEventName":sys.argv[1],"additionalContext":sys.argv[2]}}))' "$ev" "$msg"
  else
    printf '%s\n' "$msg"
  fi
  exit 0
}

# report <event> <msg>: block when STRICT=all, otherwise advise.
report() { [ "$STRICT" = all ] && block "$2"; advise "$1" "$2"; }

code_root() { local r; r="$(cfg paths.code_root)"; printf '%s' "${r:-src}"; }

is_test_file() {
  case "$1" in
    *.test.*|*.spec.*|*_test.go|*_test.py|test_*.py|*Test.php|*_spec.rb|tests/*|*/tests/*|*/__tests__/*|e2e/*|*/e2e/*) return 0 ;;
  esac; return 1
}
is_ui_file() { case "$1" in *.tsx|*.jsx|*.vue|*.svelte|*.astro|*.html) return 0 ;; esac; return 1; }
is_source_file() {
  case "$1" in
    *.d.ts|*.config.*|*/migrations/*|*/drizzle/*|*/prisma/*|*/locales/*|*/messages/*|*/public/*|*/static/*|prototypes/*|.claude/*|docs/*|production/*) return 1 ;;
    *.ts|*.tsx|*.js|*.jsx|*.mjs|*.vue|*.svelte|*.py|*.go|*.php|*.rb) return 0 ;;
  esac; return 1
}

# Secret patterns (ERE). Kept specific to avoid false positives.
SECRET_RE='(AKIA[0-9A-Z]{16}|-----BEGIN ([A-Z]+ )?PRIVATE KEY-----|sk_live_[0-9A-Za-z]{16,}|rk_live_[0-9A-Za-z]{16,}|whsec_[0-9A-Za-z]{20,}|ghp_[0-9A-Za-z]{36}|github_pat_[0-9A-Za-z_]{40,}|xox[baprs]-[0-9A-Za-z-]{10,}|sk-ant-[0-9A-Za-z_-]{20,}|sk-(proj-)?[0-9A-Za-z_-]{32,}|AIza[0-9A-Za-z_-]{35}|SG\.[0-9A-Za-z_-]{22}\.[0-9A-Za-z_-]{43}|re_[0-9A-Za-z]{8}_[0-9A-Za-z]{20,}|eyJhbGciOi[0-9A-Za-z_-]{20,}\.[0-9A-Za-z_-]{20,}\.[0-9A-Za-z_-]{20,}|(postgres|postgresql|mysql|mongodb(\+srv)?|redis)://[^:/@[:space:]]+:[^@/[:space:]]{6,}@[^[:space:]]+)'
