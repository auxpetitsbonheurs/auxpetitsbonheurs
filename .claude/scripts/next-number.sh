#!/usr/bin/env bash
# next-number.sh <dir-or-file> [prefix] [width] — prints the next free ID.
#   dir:  scans file names recursively   (stories S-012, bugs BUG-004, ADRs 0003)
#   file: scans IDs inside the file      (tech-debt.md → TD-07)
# Prefixes may be given with or without the dash ("BUG" == "BUG-").
# "ADR" or "" means bare 4-digit numbers (ADR files are NNNN-slug.md).
# Examples: next-number.sh docs/architecture/adr        → 0003
#           next-number.sh production/stories S-         → S-012
#           next-number.sh production/tech-debt.md TD    → TD-07
target="${1:?dir or file}"; prefix="${2-}"; width="${3:-}"
case "$prefix" in ADR|ADR-) prefix="" ;; ""|*-) ;; *) prefix="${prefix}-" ;; esac
if [ -z "$width" ]; then case "$prefix" in S-|BUG-) width=3 ;; E-|EXP-|TD-) width=2 ;; *) width=4 ;; esac; fi
max=0
if [ -f "$target" ] && [ -n "$prefix" ]; then
  nums="$(grep -oE "${prefix}[0-9]+" "$target" 2>/dev/null | sed "s/^${prefix}//")"
elif [ -d "$target" ]; then
  nums="$(find "$target" -type f -name "${prefix}[0-9]*" 2>/dev/null | sed "s|.*/${prefix}||" | grep -oE '^[0-9]+')"
fi
for n in $nums; do n=$((10#$n)); [ "$n" -gt "$max" ] && max=$n; done
printf "%s%0${width}d\n" "$prefix" $((max + 1))
