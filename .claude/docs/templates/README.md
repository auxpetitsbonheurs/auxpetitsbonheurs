# Templates

Skills copy these into the canonical paths in `.claude/docs/skill-conventions.md`
and fill the `[PLACEHOLDER]` fields. Keep the section headings: other skills
read them by heading.

## Discovery
| Template | Filled by | Output |
|---|---|---|
| `project-brief.md` | `/brainstorm` | `docs/product/brief.md` |
| `persona.md` | `/personas` | `docs/product/personas/<slug>.md` |
| `competitor-analysis.md` | `/competitor-audit` | `docs/product/research/competitors.md` |
| `market-research.md` | `/market-research` | `docs/product/research/<topic>.md` |
| `prd.md` | `/write-prd` | `docs/product/prd.md` |
| `estimate.md` | `/estimate` | `production/estimates/<slug>.md` |

## Design
| Template | Filled by | Output |
|---|---|---|
| `brand-guide.md` | `/brand-identity` | `docs/design/brand-guide.md` |
| `design-system.md` | `/design-system` | `docs/design/design-system.md` |
| `design-tokens.json` | `/design-tokens` | `docs/design/tokens.json` |
| `sitemap.md` | `/sitemap` | `docs/content/sitemap.md` |
| `content-strategy.md` | `/content-strategy` | `docs/content/content-strategy.md` |
| `ux-flow.md` | `/ux-flow` | `docs/design/ux/<flow-slug>.md` |
| `wireframe-brief.md` | `/wireframe` | `docs/design/ux/<screen>-wireframe.md` |
| `ux-spec.md` | `/ux-flow`, `/feature-spec` | UX section of a feature spec |
| `feature-spec.md` | `/feature-spec` | `docs/specs/features/<feature-slug>.md` |
| `api-contract.yaml` | `/api-contract` | `docs/architecture/api/openapi.yaml` |
| `data-model.md` | `/data-model` | `docs/architecture/data-model.md` |
| `architecture.md` | `/create-architecture` | `docs/architecture/architecture.md` |
| `adr.md` | `/architecture-decision` | `docs/architecture/adr/NNNN-<slug>.md` |
| `threat-model.md` | `/security-audit`, `/feature-spec` | `docs/architecture/threat-models/<slug>.md` |

## Build
| Template | Filled by | Output |
|---|---|---|
| `epic.md` | `/create-epics` | `production/epics/E-NN-<slug>.md` |
| `story.md` | `/create-stories` | `production/stories/E-NN/S-NNN-<slug>.md` |
| `sprint-plan.md` | `/sprint-plan` | `production/sprints/sprint-NN.md` |
| `test-plan.md` | `/team-qa` | `production/test-plans/<slug>.md` |
| `tech-debt-register.md` | `/tech-debt` | `production/tech-debt.md` |
| `bug-report.md` | `/bug-report` | `production/bugs/BUG-NNN-<slug>.md` |
| `milestone-review.md` | `/milestone-review` | `production/milestones/<slug>.md` |
| `retrospective.md` | `/retrospective` | `production/retros/YYYY-MM-DD.md` |

## Quality audits
| Template | Filled by | Output |
|---|---|---|
| `perf-report.md` | `/perf-audit` | `production/audits/perf-YYYY-MM-DD.md` |
| `a11y-report.md` | `/a11y-audit` | `production/audits/a11y-YYYY-MM-DD.md` |
| `security-review.md` | `/security-audit` | `production/audits/security-YYYY-MM-DD.md` |
| `seo-audit.md` | `/seo-audit` | `production/audits/seo-YYYY-MM-DD.md` |
| `privacy-dpia.md` | `/privacy-audit` | `production/audits/privacy-YYYY-MM-DD.md` |

## Launch
| Template | Filled by | Output |
|---|---|---|
| `launch-checklist.md` | `/launch-checklist` | `production/releases/<v>/checklist.md` |
| `release-checklist.md` | `/release-checklist` | `production/releases/<v>/checklist.md` |
| `release-notes.md` | `/release-notes` | `production/releases/<v>/notes.md` |
| `changelog.md` | `/changelog` | `CHANGELOG.md` |
| `runbook.md` | `/observability-setup`, `/deploy-setup` | `docs/runbooks/<topic>.md` |

## Grow
| Template | Filled by | Output |
|---|---|---|
| `analytics-tracking-plan.md` | `/analytics-plan` | `production/analytics/tracking-plan.md` |
| `funnel-review.md` | `/funnel-review` | `production/analytics/funnel-YYYY-MM-DD.md` |
| `experiment-brief.md` | `/experiment` | `production/experiments/EXP-NN-<slug>.md` |
| `email-flow.md` | `/email-flows` | `docs/content/email/<flow-slug>.md` |
| `content-calendar.md` | `/content-calendar` | `production/content-calendar.md` |
| `incident-report.md` | `/incident` | `production/incidents/YYYY-MM-DD-<slug>.md` |
| `postmortem.md` | `/postmortem` | `production/incidents/YYYY-MM-DD-<slug>-postmortem.md` |
