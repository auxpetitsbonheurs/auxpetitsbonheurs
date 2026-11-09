# Directory Structure

```
.
├── CLAUDE.md                 # Studio constitution (always loaded)
├── project.yaml              # Single source of truth: stack, stage, budgets, modes
├── .claude/
│   ├── agents/               # 55 agent definitions (directors, leads, specialists)
│   ├── skills/               # Slash commands (/start, /write-prd, /dev-story, …)
│   ├── hooks/                # Validation + session hooks (wired in settings.json)
│   ├── rules/                # Path-scoped coding rules
│   ├── scripts/              # Helpers: emit observations, never verdicts
│   ├── docs/                 # Framework reference + templates/
│   ├── settings.json         # Permissions, hooks, status line
│   └── statusline.sh
├── .claude-plugin/           # Plugin + marketplace manifests
├── docs/
│   ├── product/              # brief.md, prd.md, personas/, research/
│   ├── design/               # brand-guide.md, design-system.md, tokens.json, ux/ (flows, wireframes)
│   ├── specs/features/       # One spec per feature: <feature>.md (+ API contract + UX spec)
│   ├── architecture/         # architecture.md, adr/NNNN-*.md, api/openapi.yaml, data-model.md
│   └── content/              # content strategy, sitemap, copy decks
├── production/
│   ├── stage.txt             # legacy mirror of project.stage
│   ├── epics/  stories/  sprints/  milestones/
│   ├── releases/             # release checklists + notes
│   ├── incidents/            # incident reports + postmortems
│   ├── experiments/          # A/B experiment briefs + readouts
│   ├── test-sessions/        # manual test sessions (plan, notes, findings)
│   ├── audits/               # perf / a11y / security / seo / privacy reports
│   ├── session-state/        # active.md (gitignored checkpoint)
│   └── session-logs/         # gitignored audit trail
├── prototypes/               # throwaway prototypes + early working prototype for manual testing
├── src/                      # Application code (scaffolded by /setup-stack)
├── tests/                    # Unit + integration tests (e2e/ for Playwright)
└── studio-tests/             # Self-tests for the framework itself
```

Stack scaffolds may put code elsewhere (`app/`, `apps/web`, `packages/*` in a
monorepo). `project.yaml → paths.code_root` (written by `/setup-stack`) records
the real root; rules and hooks read it.
