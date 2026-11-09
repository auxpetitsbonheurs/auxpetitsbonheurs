# Agent Coordination Rules

1. **Vertical delegation.** Directors delegate to leads, leads to specialists.
   Never skip a tier for a complex decision.
2. **Horizontal consultation.** Agents at one tier may consult each other but
   make no binding decision outside their domain.
3. **Conflict resolution.** Escalate to the shared parent. With none:
   product/scope → `product-director`; technical → `technical-director`;
   visual/brand/UX → `design-director`; schedule and cross-team → `producer`.
4. **Change propagation.** When a spec change touches several domains (UI, API,
   schema, copy), `producer` coordinates it via `/propagate-design-change`.
5. **Contract first.** Frontend and backend meet at the API contract
   (`docs/architecture/api/` or the feature spec's contract section). Neither
   side changes it unilaterally: propose the change, `lead-backend` and
   `lead-frontend` agree, the spec is updated, then code follows.
6. **No unilateral cross-domain changes.** Never edit files outside your
   domain without delegation.
7. **Read docs by section.** Grep headings, Read the range you need.
8. **Stack specialists defer to project.yaml.** Use the specialist for the
   configured stack only; never introduce a second framework, ORM or UI kit
   without an ADR.
9. **Nothing goes upstream.** Never open issues or PRs in third-party repos.
   Draft them; the user submits.
10. **External skills are tools, not authorities.** When a dependency skill
    (e.g. `frontend-design`, `web-design-guidelines`) is installed, use it for
    its domain; project docs and the user's decisions win where they conflict.

## Subagents

Orchestration skills (`/team-*`, `/dev-story`, audits) spawn subagents with the
Agent tool. When two subagents' inputs are independent, issue both calls before
waiting for either. Surface a BLOCKED agent immediately; produce a partial
report rather than silently skipping it.

## Model tiers

| Tier | Model | Used for |
|---|---|---|
| Directors, architecture, security, gate checks | `opus` | Judgement-heavy, cross-cutting |
| Leads and most specialists | `sonnet` | Design + implementation |
| Mechanical helpers (changelog, status, lint triage) | `haiku` | Fast, low-stakes |
