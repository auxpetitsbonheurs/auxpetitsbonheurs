#!/usr/bin/env bash
# Claude Code Web Studios — status line.
# Reads the status JSON on stdin; prints: ctx% | model | stage | stack [| story]
input=$(cat)
if command -v jq >/dev/null 2>&1; then
  model=$(printf '%s' "$input" | jq -r '.model.display_name // "?"')
  pct=$(printf '%s' "$input" | jq -r '.context_window.used_percentage // empty')
  dir=$(printf '%s' "$input" | jq -r '.workspace.project_dir // .workspace.current_dir // .cwd // "."')
else
  model=$(printf '%s' "$input" | grep -oE '"display_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*:[[:space:]]*"//;s/"$//')
  pct=$(printf '%s' "$input" | grep -oE '"used_percentage"[[:space:]]*:[[:space:]]*[0-9.]+' | head -1 | sed 's/.*:[[:space:]]*//')
  dir=$(printf '%s' "$input" | grep -oE '"project_dir"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*:[[:space:]]*"//;s/"$//')
fi
dir=$(printf '%s' "${dir:-.}" | sed 's|\\|/|g')
cd "$dir" 2>/dev/null || cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null
get() { bash .claude/scripts/yaml-get.sh "$1" 2>/dev/null; }

stage=$(get project.stage); [ -z "$stage" ] && [ -f production/stage.txt ] && stage=$(head -1 production/stage.txt)
stage=${stage:-unconfigured}
fe=$(get stack.frontend); be=$(get stack.backend); db=$(get stack.database)
stack=$(printf '%s' "${fe}${be:+/$be}${db:+/$db}" | sed 's|^/||')

out=""
[ -n "$pct" ] && out="ctx ${pct%.*}% | "
out="${out}${model:-?} | ${stage}"
[ -n "$stack" ] && out="${out} | ${stack}"
if [ -f production/session-state/active.md ]; then
  story=$(grep -m1 -E '^(Story|Active story):' production/session-state/active.md 2>/dev/null | sed 's/^[^:]*:[[:space:]]*//')
  [ -n "$story" ] && out="${out} | ${story}"
fi
printf '%s\n' "$out"
