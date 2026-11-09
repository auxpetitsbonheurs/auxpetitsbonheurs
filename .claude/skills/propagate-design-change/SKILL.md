---
name: propagate-design-change
description: "Propagates a change in one document (PRD, feature spec, API contract, data model, ADR, design system or brand guide) to everything that depends on it: lists every affected spec, story, contract, test and code area, updates the docs after approval, and flags stories to re-check readiness. Use whenever an upstream decision changes."
argument-hint: "<path of the changed doc> [what changed]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*), Bash(git diff*), Bash(git log*)
model: sonnet
---

# Propagate Design Change

Run by `producer`. Given a changed document, it finds what depends on it,
shows the impact, updates the affected **documents** after approval, and marks
affected stories for re-readiness. It never edits source code; code changes
become stories or tasks for their owners.

## Inputs

- Argument: the changed doc path, and optionally a summary of the change
- `git diff` / `git log -p` of that file (uncommitted or last commit) to see
  exactly what changed
- `bash .claude/scripts/story-list.sh` for story statuses

## Phases

### Phase 1: Understand the change

Summarise the change in plain terms (added, removed, renamed, changed meaning)
from the diff or the user's description. Ask the user to confirm the summary.

### Phase 2: Find dependents

Grep for the changed doc's path, its anchors, and the key terms that changed
(entity names, field names, endpoint paths, component names, requirement IDs,
token names) across:
- `docs/product/`, `docs/specs/features/`, `docs/design/`, `docs/content/`,
  `docs/architecture/` (contract, data model, ADRs)
- `production/epics/`, `production/stories/`, `production/sprints/`
- `tests/` and the code root (report only)

Build an impact table:

| Artifact | Type | What it references | Impact | Owner | Action |

Actions: `update doc`, `re-ready story` (set Status back to `draft`),
`new story`, `code change` (owner), `no change`.

### Phase 3: Route by owner

If three or more teams are affected, list which leads must agree (e.g. a
contract change needs `lead-backend` and `lead-frontend`). Brief those leads in
parallel with the change and their rows; collect objections. Product, technical
or design conflicts go to the matching director and then the user.

### Phase 4: Approve

Show the impact table and the proposed doc edits (as diffs). Ask the user to
approve the changeset (list every file). Stories `in-progress` are flagged, not
changed, and the user decides whether to pause them.

### Phase 5: Apply and record

Edit the approved docs, set affected `ready` stories to `draft` with a note
`Re-check: <changed doc> changed on YYYY-MM-DD`, and append a summary to
`production/session-state/active.md`.

## Output

Updated docs and stories (approved files only), and the impact table in the reply.

## Next step

`/story-readiness` for the re-drafted stories; `/create-stories` for new ones.
