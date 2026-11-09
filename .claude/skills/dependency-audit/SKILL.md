---
name: dependency-audit
description: "Audits third-party dependencies for known vulnerabilities, licence problems, abandoned packages and outdated major versions across npm/pnpm/yarn/bun, pip/uv/poetry, Go, Composer and Bundler. Use before launch, when adding dependencies, when a manifest changes, or on a schedule."
argument-hint: "[no arguments]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, AskUserQuestion, Agent, Bash(bash .claude/scripts/*), Bash(npm audit*), Bash(pnpm audit*), Bash(yarn npm audit*), Bash(yarn audit*), Bash(bun audit*), Bash(npm outdated*), Bash(pnpm outdated*), Bash(pip-audit*), Bash(uv pip list*), Bash(govulncheck*), Bash(go list*), Bash(composer audit*), Bash(composer outdated*), Bash(bundle audit*), Bash(bundle outdated*), Bash(npx license-checker*)
model: sonnet
---

# Dependency Audit

Reports dependency risk and writes `production/audits/deps-YYYY-MM-DD.md`. It
never upgrades, removes or installs packages without approval, and never runs
`audit fix --force`.

## Inputs

- Manifests and lockfiles at the repo root and in workspaces (`package.json` + lockfile, `pyproject.toml`/`requirements*.txt`/`uv.lock`, `go.mod`, `composer.json`, `Gemfile.lock`)
- `project.yaml`: `stack.package_manager`, `stack.language`

## Phases

### Phase 1: Detect ecosystems

Run `bash .claude/scripts/detect-stack.sh` and list every manifest found
(including monorepo workspaces). A manifest without a lockfile is itself a
**High** finding: installs are not reproducible.

### Phase 2: Vulnerabilities

Run the matching tool for each ecosystem (JSON output where available):

| Ecosystem | Command |
|---|---|
| npm | `npm audit --json` |
| pnpm | `pnpm audit --json` |
| yarn (berry) | `yarn npm audit --json` |
| bun | `bun audit` |
| Python | `pip-audit -f json` (or inside `uv run`) |
| Go | `govulncheck ./...` |
| PHP | `composer audit --format=json` |
| Ruby | `bundle audit check --update` |

If a tool is missing, print the install command and mark the ecosystem `NOT
ASSESSED`. For each vulnerability, note: package, installed and fixed version,
severity, whether it is a dev-only dependency, and whether the vulnerable code
path is plausibly reachable (e.g. a ReDoS in a build tool is lower risk than in
a request parser).

### Phase 3: Licences

Run `npx license-checker --summary` (or the ecosystem equivalent). Flag
copyleft licences (GPL, AGPL, SSPL) in runtime dependencies of a closed-source
product and unknown/unlicensed packages. Say this is not legal advice.

### Phase 4: Health and freshness

- Outdated majors (`npm outdated`, `pnpm outdated`, `composer outdated`, `bundle outdated`): especially the framework, ORM, auth and payment SDKs.
- Abandoned or risky packages: no release in 2+ years, single maintainer for a critical path, recent ownership change, `postinstall` scripts.
- Duplicates and heavy deps that `performance-engineer` should know about.

### Phase 5: Report

Write the report (template: `security-review`, section "Dependencies"), with a
table per ecosystem and findings ranked **Critical / High / Medium / Low**.
For each fix give the exact command (`pnpm up <pkg>@<version>`) and whether it
is a major upgrade that needs a story. Ask before writing.

### Phase 6: Follow-up

Offer: a story per major upgrade, a bug per Critical/High vulnerability, and a
`security-lead` review for anything reachable. Nothing is upgraded without a yes.

## Output

`production/audits/deps-YYYY-MM-DD.md` (template: `.claude/docs/templates/security-review.md`).

## Rigor

- `minimal`: vulnerabilities only.
- `standard`: adds licences and outdated majors.
- `full`: adds package health review and reachability analysis by `security-lead`.

## Next step

`/bug-triage`, or `/security-audit` if anything Critical is reachable.
