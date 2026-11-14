# Handover evidence (S-234) — 2026-11-14

| AC | State | Evidence |
|---|---|---|
| AC1 README: each service, run locally, deploy (staging, live), restore, every setting incl. each variable in `.env.example` | **Mostly** | `src/README.md`: Services and accounts, Run locally, Checks, Deploy (launch URLs, how deploys happen, rollback, migrations, launch checklist), Secrets, Backups, **Restore a backup** (new), links to `docs/runbooks/` (deploy-keys, restore, free-plans, custom-domain, testing, worker-cpu). The variable list is `src/.dev.vars.example` (Workers convention) with `deploy-keys.md` explaining each. Not done: a fresh-clone run by a second person |
| AC2 one-page sheet: purpose, where to log in, account email, yearly cost; only the domain paid | **Done** | `docs/handover/handover-sheet.md` (screenshot `launchprep-handover-sheet.png`) |
| AC3 secrets in the bakery's accounts, none only on a developer machine, none in the repo | **Partly** | No real secret in the repository (gitleaks in CI; the security review found none in history). Secrets live in GitHub (repository and `staging` environment) and Cloudflare. Production secrets and the password-manager copy are Owner steps (`production/releases/launch-checklist.md` section 1) |
| AC4 PRD handover checklist ticked with evidence | See below | |
| AC5 Owner-facing parts in plain language | **EN done, FR planned** | The sheet's "What each admin screen does" and three how-tos; French version when the Owner chooses (her decision) |
| AC6 links checked by a script, commands tried | **Links pass** | A link checker over the README, runbooks, sheet, launch checklist and audits: 16 documents, 0 broken links or missing paths. Commands: `scripts/backup-dump.sh` and `backup-verify.sh` run (locally and in CI); the restore runbook's commands match them |

## PRD section 11 handover checklist

| Item | Ticked | Evidence or reason |
|---|---|---|
| All service accounts on the bakery's own email | ☐ | Owner confirms on each dashboard (README "Services and accounts" table to fill) |
| Two-step sign-in handed over | ☐ | Owner, per account (README table "MFA on") |
| Domain registered to Aux petits bonheurs, auto-renew, bakery's card | ☐ | Launch on `workers.dev`; domain later (`docs/runbooks/custom-domain.md`) |
| Secrets in the bakery's accounts | ☐ | Staging: yes (GitHub environment, Cloudflare). Production: not created yet |
| README (services, run locally, deploy, restore, every setting) | ☑ | `src/README.md` and the runbooks |
| One-page handover sheet | ☑ | `docs/handover/handover-sheet.md` |
| Weekly backups to bakery storage with a tested restore | ◐ | Restore tested on staging data (`backup-restore-2026.md`); production backup needs the Owner's secrets and the first Sunday run |
| Code, design and content stated to belong to Aux petits bonheurs | ☑ | Handover sheet, first lines |
| Builder a team member for 3 months, removable by the Owner | ☑ | Handover sheet "Who to call", with where to remove |
