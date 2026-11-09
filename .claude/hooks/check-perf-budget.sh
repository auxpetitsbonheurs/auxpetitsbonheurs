#!/usr/bin/env bash
# PostToolUse(Write|Edit): performance smells against project.yaml budgets.
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
f="$(hook_file)"; [ -z "$f" ] && exit 0
[ -f "$f" ] || exit 0
issues=""; add() { issues="${issues}
- $1"; }
case "$f" in
  *.png|*.jpg|*.jpeg|*.gif|*.webp|*.avif|*.svg)
    max="$(cfg budgets.image_max_kb)"; max="${max:-250}"
    kb=$(( $(wc -c < "$f" | tr -d ' ') / 1024 ))
    [ "$kb" -gt "$max" ] && add "image is ${kb} KB (budget ${max} KB): compress, resize, or serve AVIF/WebP"
    ;;
  *.ts|*.tsx|*.js|*.jsx|*.vue|*.svelte|*.astro)
    grep -qE "from ['\"]moment['\"]" "$f" && add "'moment' is ~70 KB: use date-fns, dayjs or Intl"
    grep -qE "from ['\"]lodash['\"]" "$f" && add "whole-lodash import: import the function (lodash-es/x) or use native"
    if [ "$(cfg stack.frontend)" = nextjs ]; then
      grep -qE '<img[[:space:]]' "$f" && add "raw <img> in Next.js: use next/image for sizing and lazy loading"
      if head -3 "$f" | grep -qE "^['\"]use client['\"]"; then
        grep -qE "from ['\"](@/lib/db|@/server|drizzle-orm|@prisma/client|server-only)" "$f" && add "client component imports server-only code"
        n=$(grep -cE '^import ' "$f"); [ "$n" -gt 25 ] && add "client component with $n imports: split it or move logic to the server"
      fi
    fi
    case "$(cfg stack.frontend)" in astro) grep -qE 'client:load' "$f" && add "client:load hydrates immediately: prefer client:visible or client:idle" ;; esac
    ;;
  *) exit 0 ;;
esac
[ -z "$issues" ] && exit 0
report PostToolUse "performance check for '$f':$issues"
