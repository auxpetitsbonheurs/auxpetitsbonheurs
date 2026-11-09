#!/usr/bin/env bash
# PostToolUse(Write|Edit) on UI files: static accessibility smells.
# Heuristic only; /a11y-audit runs axe against the real page.
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
f="$(hook_file)"; [ -z "$f" ] && exit 0
is_ui_file "$f" || exit 0
[ -f "$f" ] || exit 0
issues=""
add() { issues="${issues}
- $1"; }
l="$(grep -nE '<(img|Image)[[:space:]][^>]*>' "$f" | grep -vE 'alt=|:alt=|\[alt\]' | cut -d: -f1 | head -3 | paste -sd, -)"
[ -n "$l" ] && add "image without alt (line $l): add alt text, or alt=\"\" if decorative"
l="$(grep -nE '<(div|span|li|td)[^>]*(onClick|@click|on:click|\(click\))=' "$f" | grep -vE 'role=' | cut -d: -f1 | head -3 | paste -sd, -)"
[ -n "$l" ] && add "click handler on a non-interactive element (line $l): use <button>/<a>, or add role, tabIndex and key handling"
l="$(grep -nE 'tabindex="[1-9]|tabIndex=\{?[1-9]' "$f" | cut -d: -f1 | head -3 | paste -sd, -)"
[ -n "$l" ] && add "positive tabindex (line $l) breaks natural focus order"
l="$(grep -nE '<a[[:space:]]' "$f" | grep -vE 'href|:href|\[href\]|\{\.\.\.' | cut -d: -f1 | head -3 | paste -sd, -)"
[ -n "$l" ] && add "<a> without href (line $l): use a <button> for actions"
l="$(grep -nE '<(video|audio)[^>]*autoplay' "$f" | grep -viE 'muted' | cut -d: -f1 | head -3 | paste -sd, -)"
[ -n "$l" ] && add "autoplaying media with sound (line $l)"
l="$(grep -nE 'outline:[[:space:]]*none|outline-none' "$f" | grep -vE 'focus-visible|focus:ring|focus-visible:' | cut -d: -f1 | head -3 | paste -sd, -)"
[ -n "$l" ] && add "focus outline removed without a visible replacement (line $l)"
l="$(grep -nE '<button[^>]*>[[:space:]]*<(svg|Icon|[A-Z][A-Za-z]*Icon)' "$f" | grep -vE 'aria-label|sr-only' | cut -d: -f1 | head -3 | paste -sd, -)"
[ -n "$l" ] && add "icon-only button may lack an accessible name (line $l): add aria-label or sr-only text"
[ -z "$issues" ] && exit 0
report PostToolUse "accessibility check for '$f':$issues"
