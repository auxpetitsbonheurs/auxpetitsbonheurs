---
name: install-deps
description: "Checks which recommended external skills and MCP servers (frontend-design, webapp-testing, web-design-guidelines, Playwright MCP, and others) are installed and guides installing the missing ones. Never installs without a yes. Use when setting up the studio, when a skill reports a missing dependency, or when the user asks which add-ons help."
argument-hint: "[all | design | testing | react | ai]"
user-invocable: true
allowed-tools: Read, Glob, Grep, AskUserQuestion, Bash(ls *), Bash(claude mcp list*), Bash(claude mcp add playwright*)
model: haiku
---

# Install recommended dependencies

The studio reuses proven public skills instead of duplicating them (see
`docs/RECOMMENDED-SKILLS.md`). This skill finds which are already available,
explains what each missing one adds, and prints the install commands. Plugin
installs are slash commands the **user** runs; the only thing it may run itself
is the Playwright MCP add, and only after a yes.

## Inputs

- `docs/RECOMMENDED-SKILLS.md`: the dependency list, sources and users
- The skills available in this session (the skill list in your context)
- `ls ~/.claude/plugins ~/.claude/skills .claude/skills 2>/dev/null` for installed plugin/skill folders
- `claude mcp list` for MCP servers
- Argument: a group to narrow the list

| Group | Dependencies |
|---|---|
| design | `frontend-design`, `theme-factory`, `web-artifacts-builder`, `web-design-guidelines` |
| testing | `webapp-testing`, Playwright MCP |
| react | `react-best-practices`, `composition-patterns`, `react-native-skills` |
| ai | `claude-api`, `mcp-builder` |
| hosting | `deploy-to-vercel` |

## Phases

### Phase 1: Detect

For each dependency mark **installed** (name appears in the available skills,
or a matching folder/plugin exists; for Playwright, `claude mcp list` shows
`playwright`), **missing**, or **unknown** (could not check). Only list the
React group when `stack.frontend` is a React-family framework (nextjs, remix)
or the user asks, and `deploy-to-vercel` only when `stack.hosting: vercel`.

### Phase 2: Show

Table: dependency, status, what it adds to this project (one line), which
studio skills use it. Recommend the design and testing groups for every
non-`api` project.

### Phase 3: Guide

For missing skills, print the commands for the user to run:

```text
/plugin marketplace add anthropics/skills
/plugin install example-skills@anthropic-agent-skills

/plugin marketplace add vercel-labs/agent-skills
/plugin install <plugin-name>@<marketplace-name>   # pick the listed skills
```

Tell the user the exact marketplace and plugin names may differ by version:
`/plugin` opens the browser to confirm. For Playwright MCP, ask "Add the
Playwright MCP server now?" and on yes run
`claude mcp add playwright -- npx @playwright/mcp@latest`.

Remind the user that a newly installed skill becomes available in the next
session (or after `/reload-plugins` where supported), and that every studio
skill works without these, only with less depth.

## Output

Chat only (plus the Playwright MCP registration on yes).
