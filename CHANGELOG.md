# Changelog

All notable changes to Claude Code Web Studios. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning: SemVer.

## [0.1.0] - 2026-11-08

### Added
- `/working-prototype`: early runnable prototype of the core journeys (mocked backend, seeded resettable data, role/scenario/network toolbar) built in the Design stage for manual testing
- `/test-session`: plan → run → report manual testing loop with routed findings; used on the prototype, vertical slice, every milestone and as UAT; `test-session` template
- Gates require a tested working prototype (design → build) and a manual session on the build (build → launch) under `standard`/`full`; `/help`, `project-state.sh` and `detect-gaps.sh` track them
- `/client-demo`: Figma-style, high-fidelity clickable demo (hotspots, device and state toggles, feature tour, presenter notes, feedback loop) as a static site for clients

### Changed (after a dry run on a fresh create-next-app project, and running the hooks live)
- `/code-review` renamed to `/review-code` to avoid clashing with Claude Code's built-in skill
- `test-run.sh` distinguishes `runner-missing` and `runner-error` (broken test setup) from failing tests; the push gate advises on a missing runner and blocks a broken one only under `full`
- `validate-push.sh` checks the pushed refspec, not just the current branch, before warning about `main`
- Commit-message check reads only the text after the commit command and handles multi-line `-m` and `-F -` heredocs (it misread compound commands before)
- Hooks ignore files outside the project
- `dependency-audit.sh` stays quiet when the manifest is unchanged
- Stack specialists, `/setup-stack` and `/adopt` honour framework-shipped agent docs (`AGENTS.md`, `node_modules/next/dist/docs/`) and existing agent instruction files
- Stack matrix documents npm `ERESOLVE` / skipped-peer pitfalls

### Added
- 55 agents: 4 directors, 10 leads, 22 core specialists, 19 stack specialists, with tier-specific collaboration protocols, gates, escalation and delegation maps
- 97 skills covering onboarding, Discovery, Design, Build, audits, Launch, Grow, bugs and team orchestrations
- 17 hooks: secret/env blocking, read guard, conventional commits, push test gate, TDD guard, a11y/perf/security smells, dependency notes, skill-change reminders, session briefing, gap detection, pre-compact checkpoint, agent audit trail, notifications
- 18 path-scoped rules and 45 document templates
- `project.yaml` config with rigor (`minimal`/`standard`/`full`) and automation (`ask`/`batch`/`auto`) modes
- Helper scripts: yaml-get, config-set, set-stage, project-state, detect-stack, test-run, story-list, next-number
- Stage gates, stack matrix, skill conventions, hooks reference, role aliases
- Status line, plugin + marketplace manifests, plugin hooks
- `studio-tests/` (lint, script and hook behaviour tests) and CI workflow
