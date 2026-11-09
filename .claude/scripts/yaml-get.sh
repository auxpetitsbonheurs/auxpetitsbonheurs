#!/usr/bin/env bash
# yaml-get.sh <dotted.key> [file]
# Prints the scalar value of a dotted key from a simple block-style YAML file
# (2-space indentation, no flow maps). Prints nothing when the key is absent
# or null. Observation only: never fails the caller (exit 0 always).
key="${1:-}"; file="${2:-project.yaml}"
[ -z "$key" ] || [ ! -f "$file" ] && exit 0
awk -v want="$key" '
  function strip(v) {
    sub(/[ \t]+#.*$/, "", v); sub(/^[ \t]+/, "", v); sub(/[ \t]+$/, "", v)
    if (v ~ /^".*"$/ || v ~ /^\x27.*\x27$/) v = substr(v, 2, length(v) - 2)
    return v
  }
  /^[ \t]*#/ || /^[ \t]*$/ { next }
  {
    match($0, /^ */); depth = int(RLENGTH / 2)
    line = substr($0, RLENGTH + 1)
    if (line ~ /^- /) next
    k = line; sub(/:.*/, "", k)
    v = line; if (index(v, ":")) v = substr(v, index(v, ":") + 1); else next
    path[depth] = k
    for (i = depth + 1; i < 16; i++) delete path[i]
    full = path[0]; for (i = 1; i <= depth; i++) full = full "." path[i]
    if (full == want) {
      v = strip(v)
      if (v != "" && v != "null" && v != "~") print v
      exit
    }
  }' "$file"
exit 0
