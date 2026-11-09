# Config Resolution

Skills and hooks resolve a key in this order (first hit wins):

1. `project.local.yaml` — per-developer, gitignored (`/settings --local k=v`)
2. `project.yaml` — committed, shared (`/settings k=v`)
3. Rigor expansion — the knobs `modes.rigor` implies (below)
4. Built-in default

## Rigor expansion

| Knob | minimal | standard | full |
|---|---|---|---|
| `modes.review_mode` | solo | lean | full |
| `quality.tdd` | advisory | required for `src/` logic | required everywhere, hook blocks |
| `quality.hook_strictness` | warn | block secrets + commit errors | block every failed check |
| `docs.density` | brief | standard | full |
| `quality.gates` | stage gates advisory | stage gates required | gates + director sign-off |
| `quality.audits_before_launch` | perf + security | perf, a11y, security, seo | all six audits |

## Automation

`modes.automation`: `ask` (confirm every write, default), `batch` (approve a
phase's changeset once), `auto` (orchestrated skills write named artifacts
without re-asking; code edits and anything outward-facing still ask).
