"""Prints the subject line of the commit message in a `git commit ...` argument string (stdin).
Handles -m/--message with single or double quotes (multi-line) and -F - with a heredoc."""
import re, sys

c = sys.stdin.read()
m = re.search(r"(?:^|\s)(?:-m|--message)(?:=|\s*)([\"'])(.*?)(?<!\\)\1", c, re.S)
if m:
    body = m.group(2).strip()
    if body:
        print(body.splitlines()[0])
elif re.search(r"(?:^|\s)(?:-F\s*-|--file[= ]-)(?:\s|$)", c):
    h = re.search(r"<<-?\s*['\"]?(\w+)['\"]?[^\n]*\n(.*?)(?:^\1\s*$|\Z)", c, re.S | re.M)
    if h:
        lines = [l for l in h.group(2).splitlines() if l.strip()]
        if lines:
            print(lines[0])
