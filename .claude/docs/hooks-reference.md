# Hooks Reference

Wired in `.claude/settings.json` (template install) and `.claude-plugin/hooks.json`
(plugin install). Every hook reads `modes.rigor` (or an explicit
`quality.hook_strictness`: `warn` | `secrets` | `all`).

| Hook | Event | minimal | standard | full |
|---|---|---|---|---|
| `validate-write.sh` | PreToolUse Write/Edit | **blocks** secrets, `.env`, key files | **blocks** | **blocks** |
| `validate-read.sh` | PreToolUse Read | advises | blocks whole-file reads of docs > 40 KB | blocks |
| `validate-commit.sh` | PreToolUse Bash (`git commit`) | blocks staged `.env`/secrets; warns on message | + blocks non-conventional message | + runs `lint`/`typecheck` scripts |
| `validate-push.sh` | PreToolUse Bash (`git push`) | warns on main | runs unit tests, warns on failure | blocks on failure |
| `tdd-guard.sh` | PostToolUse | off | advises when source has no matching test | Claude must add the test |
| `check-a11y.sh` | PostToolUse (UI files) | advises | advises | must fix |
| `check-perf-budget.sh` | PostToolUse | advises | advises | must fix |
| `scan-security.sh` | PostToolUse (source) | advises | advises | must fix |
| `dependency-audit.sh` | PostToolUse (manifests) | lists new deps | lists new deps | + quick `audit --audit-level=high` |
| `validate-skill-change.sh` | PostToolUse (skills/agents) | reminds `/skill-test` | | |
| `session-start.sh`, `detect-gaps.sh` | SessionStart | briefing + stage gaps | | |
| `pre-compact.sh` | PreCompact | keeps `active.md` in view | | |
| `session-stop.sh` | Stop (async) | session log line | | |
| `log-agent.sh`, `log-agent-stop.sh` | SubagentStart/Stop | agent audit trail in `production/session-logs/` | | |
| `notify.sh` | Notification | desktop notification (macOS/Linux/Windows) | | |

**"Must fix"** on a PostToolUse hook means exit code 2: the edit already
happened, and Claude is told to correct it before continuing.

Hooks fail open: if their input cannot be parsed (no `jq` and no `python3`),
they exit 0 rather than block work. Secret detection is pattern-based; it
skips local database URLs (`@localhost`, `@db`, `@postgres`) and obvious
placeholders.

Set `quality.tdd: off` to disable the TDD guard, or `quality.tdd: required`
to make it blocking under standard rigor.
