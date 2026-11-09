#!/usr/bin/env bash
# PreToolUse(Read): large docs must be read by section (Grep headings, then offset/limit).
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
f="$(hook_file)"; [ -z "$f" ] && exit 0
case "$f" in docs/*|production/*) ;; *) exit 0 ;; esac
[ -n "$(json_get .tool_input.offset)$(json_get .tool_input.limit)" ] && exit 0
[ -f "$f" ] || exit 0
size=$(wc -c < "$f" | tr -d ' ')
[ "$size" -le 40960 ] && exit 0
msg="'$f' is $((size / 1024)) KB. Find the section you need with Grep (pattern '^#', output_mode content) and Read that range with offset/limit."
[ "$RIGOR" = minimal ] && advise PreToolUse "$msg"
block "$msg"
