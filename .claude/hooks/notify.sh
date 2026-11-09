#!/usr/bin/env bash
# Notification: desktop notification when Claude needs input. Best effort.
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
msg="$(json_get .message)"; msg="${msg:-Claude needs your input}"
title="Web Studios"
if command -v osascript >/dev/null 2>&1; then
  osascript -e "display notification \"${msg//\"/\'}\" with title \"$title\"" >/dev/null 2>&1
elif command -v notify-send >/dev/null 2>&1; then
  notify-send "$title" "$msg" >/dev/null 2>&1
elif command -v powershell.exe >/dev/null 2>&1; then
  powershell.exe -NoProfile -Command "[void][System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms'); \$n=New-Object System.Windows.Forms.NotifyIcon; \$n.Icon=[System.Drawing.SystemIcons]::Information; \$n.Visible=\$true; \$n.ShowBalloonTip(5000,'$title','${msg//\'/}','Info')" >/dev/null 2>&1
fi
exit 0
