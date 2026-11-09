# Contributing

Thanks for helping improve Claude Code Web Studios.

1. Fork and branch from `main`.
2. Make your change:
   - **Agents:** keep the section structure (Collaboration Protocol, Key Responsibilities, What This Agent Must NOT Do, Delegation Map) and add the agent to `.claude/docs/agent-roster.md`.
   - **Skills:** follow `.claude/docs/skill-conventions.md`, use canonical paths and templates, and list the skill in `docs/BLUEPRINT.md` §4.
   - **Hooks:** source `hooks/lib.sh`, fail open on unparseable input, respect `modes.rigor`, and add a case to `studio-tests/hooks.sh`.
   - **Stack support:** add the stack value to `project.yaml` comments, `.claude/docs/stack-matrix.md`, `detect-stack.sh`, and a specialist agent if needed.
3. Run `bash studio-tests/run.sh` until it passes.
4. Add a CHANGELOG entry and open a PR.

Never commit real secrets, even in tests; build fake ones at runtime as `studio-tests/hooks.sh` does.
