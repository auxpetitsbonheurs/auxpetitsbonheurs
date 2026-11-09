#!/usr/bin/env bash
# config-set.sh [--local] <dotted.key>=<value>
# Sets a scalar in project.yaml (or project.local.yaml with --local).
# Supports keys up to two levels deep (section.key). Creates the section or
# key when absent. Prints what changed. Exit 1 only on malformed input.
file="project.yaml"
if [ "${1:-}" = "--local" ]; then file="project.local.yaml"; shift; fi
arg="${1:-}"
case "$arg" in *=*) ;; *) echo "usage: config-set.sh [--local] section.key=value" >&2; exit 1 ;; esac
key="${arg%%=*}"; val="${arg#*=}"
case "$key" in
  *.*.*) echo "config-set: keys deeper than two levels are not supported: $key" >&2; exit 1 ;;
  *.*) section="${key%%.*}"; leaf="${key#*.}" ;;
  *) section=""; leaf="$key" ;;
esac
[ -f "$file" ] || printf 'schema_version: 1\n' > "$file"
tmp="$(mktemp)"
awk -v section="$section" -v leaf="$leaf" -v val="$val" '
  BEGIN { insec = (section == ""); done = 0; seen = 0 }
  {
    if (section != "" && $0 ~ "^" section ":[ \t]*($|#)") { insec = 1; seen = 1; print; next }
    if (section != "" && insec && $0 ~ /^[^ \t#]/) {
      if (!done) { print "  " leaf ": " val; done = 1 }
      insec = 0
    }
    pat = (section == "" ? "^" : "^  ") leaf ":"
    if (insec && !done && $0 ~ pat) {
      cmt = ""; if (match($0, /[ \t]+#.*$/)) cmt = substr($0, RSTART)
      print (section == "" ? "" : "  ") leaf ": " val cmt; done = 1; next
    }
    print
  }
  END {
    if (!done) {
      if (section == "") print leaf ": " val
      else { if (!seen) { print ""; print section ":" } ; print "  " leaf ": " val }
    }
  }' "$file" > "$tmp" && mv "$tmp" "$file"
echo "set $key = $val in $file"
