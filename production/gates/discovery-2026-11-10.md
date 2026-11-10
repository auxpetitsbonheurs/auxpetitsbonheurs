# Gate: discovery → design   (2026-11-10, rigor: standard)
Verdict: CONCERNS

Run retroactively: the design work had already been done before this gate was recorded.

## Artifacts
| Artifact | Required | Found | Notes |
|---|---|---|---|
| docs/product/brief.md | yes | yes | Launch values updated 2026-11-10 |
| docs/product/prd.md | yes | yes | v0.3 |
| docs/product/personas/*.md | ≥ 1 | 3 | p1-customer, p2-owner, p3-admin. Assumption-labelled |
| docs/product/research/* | optional | no | Optional at standard |
| PRD `## Scope` with MVP cut | yes | yes | §4. Cut order added in §11 |

## Signer verdicts
| Gate ID | Agent | Verdict | Key points |
|---|---|---|---|
| PD-GATE | product-director | CONCERNS | Unconfirmed metric targets; 3 FRs not measurable; capacity not stated; loose MVP cut; stale persona note |

## Blocking findings
None.

## Concerns
- Fixed in f69dc19: targets accepted as working targets with a 4-week post-launch baseline; FR-028, FR-047 and FR-071 now measurable; capacity and Should-item cut order stated; stale lines removed.
- Open: there is no market or competitor research (optional).

## Next steps
- Review the metric targets 4 weeks after launch (`/funnel-review`).
