# Sprint 02

Dates: 2026-11-12 → 2026-11-25 (2 weeks) · Capacity: agent-driven build; sprint 01 delivered ~66 pts in ~2 agent-days. Planned on ~135 pts of agent throughput over the sprint, gated by Owner review time, so ~80% is committed.
Milestone: MVP (E-02 Admin access and team, E-03 Menu and content management) · Goal: on staging, the Owner invites a helper and manages the team from a phone, and enters the real menu (products, photos, sizes and box options, prices, seasonal dates) plus the business settings, content, availability rules and blocked dates.

## Committed
| Story | Title | Estimate | Owner | Status |
|---|---|---|---|---|
| S-021 | A customer account can never open admin pages | 2 | auth-specialist, test-engineer | review |
| S-022 | Owner-only screens refuse Admins on the server | 3 | auth-specialist, remix-specialist, ui-engineer | review |
| S-023 | Rate limits on sign-in and password reset | 3 | api-engineer, postgres-specialist, auth-specialist | review |
| S-024 | Password reset emails through the auth email hook | 5 | email-specialist, auth-specialist, api-engineer | ready |
| S-025 | Ask for a password reset link | 3 | auth-specialist, ui-engineer, remix-specialist | ready |
| S-026 | Set a new password from the reset link | 3 | auth-specialist, ui-engineer, remix-specialist | ready |
| S-027 | Team screen listing admins and pending invitations | 3 | remix-specialist, ui-engineer, tailwind-shadcn-specialist | ready |
| S-028 | Invite a helper by email | 5 | auth-specialist, email-specialist, api-engineer, ui-engineer | ready |
| S-029 | Accept an invitation and set a password | 3 | auth-specialist, ui-engineer, remix-specialist | ready |
| S-030 | Resend or revoke an invitation | 2 | auth-specialist, ui-engineer | ready |
| S-031 | Change an admin's role without losing the last Owner | 5 | auth-specialist, postgres-specialist, api-engineer, ui-engineer | ready |
| S-032 | Deactivate and reactivate an admin | 5 | auth-specialist, postgres-specialist, api-engineer, ui-engineer | ready |
| S-033 | Admin app frame with one-handed bottom bar | 3 | ui-engineer, tailwind-shadcn-specialist, accessibility-specialist, remix-specialist | review |
| S-034 | Orders badge showing how many need review | 2 | ui-engineer, remix-specialist | ready (contract resolved 2026-11-11) |
| S-035 | Install the admin app on the home screen | 3 | remix-specialist, ui-engineer, hosting-platform-specialist | ready |
| S-036 | My profile with name, language, password and alert switches | 3 | remix-specialist, ui-engineer, auth-specialist | ready |
| S-041 | Menu list grouped by type | 3 | remix-specialist, ui-engineer, tailwind-shadcn-specialist | review |
| S-042 | Reorder products within a type | 5 | remix-specialist, ui-engineer, accessibility-specialist, postgres-specialist | review |
| S-043 | Hide a product or mark it sold out | 2 | remix-specialist, api-engineer, ui-engineer | review |
| S-045 | Delete a product safely | 2 | remix-specialist, postgres-specialist, ui-engineer | review |
| S-046 | Create and edit a product's basic details | 5 | remix-specialist, ui-engineer, tailwind-shadcn-specialist, api-engineer | review |
| S-047 | Add up to five product photos from the phone | 5 | baas-specialist, ui-engineer, remix-specialist, api-engineer | review |
| S-048 | Add sizes, flavours, add-ons and a message field to a product | 5 | remix-specialist, ui-engineer, tailwind-shadcn-specialist, api-engineer | review (AC9 manual session open) |
| S-049 | Set seasonal dates on a product | 2 | remix-specialist, ui-engineer, api-engineer | review |
| S-050 | Renamed product links keep working | 3 | remix-specialist, postgres-specialist, api-engineer | review |
| S-051 | Preview a product as a customer would see it | 3 | remix-specialist, ui-engineer | review |
| S-241 | Load the Owner's real menu on staging | 3 | data-engineer, baas-specialist, postgres-specialist, devops-lead | review |
| S-056 | Owner sets notice days, closed days and time windows | 5 | remix-specialist, ui-engineer, api-engineer, postgres-specialist | ready |
| S-057 | Owner blocks days or ranges with a private reason | 3 | remix-specialist, ui-engineer, api-engineer, postgres-specialist | ready |
| S-058 | Owner edits delivery fee, contacts, Juice number and business rules | 5 | remix-specialist, ui-engineer, api-engineer, postgres-specialist | ready |
| S-059 | Owner edits homepage, About, FAQ, policies and privacy text | 3 | remix-specialist, ui-engineer, api-engineer | ready |
| TD G-19 | CI secret scan: gitleaks + client-bundle secret-name check (tech-debt.md, threat-model G-19) | 2 | devops-lead, security-lead | done |
Total: 109 pts of ~135 (≈80%; slack kept for Owner-test fixes, ADR-0004 rebase and surprises). E-02 53 · E-03 51 · S-241 3 · tech debt 2.

## Stretch
| Story | Title | Estimate |
|---|---|---|
| S-044 | Duplicate a product as a starting point | 3 |
| S-052 | Promotions list with automatic Scheduled, Live and Ended | 3 |
| S-053 | Create and edit a promotion with discounts | 5 |
| S-060 | Owner edits WhatsApp message templates with a live preview | 3 |
| S-054 | Upload gallery photos and tag them by occasion | 5 |
| S-055 | Caption, reorder and delete gallery photos | 3 |
Stretch total: 22 pts. Order: S-044 first (it speeds up entering similar cakes), then promotions, WhatsApp templates, gallery.

## Build order (batches; each batch is built, reviewed and pushed to staging before the next)
Within a batch, stories run in the order listed (later ones may depend on earlier ones).
1. **Admin frame and guards** (11 pts): S-021 → S-022 → S-033 → S-023. Unblocks every admin screen; closes the sign-in rate-limit TD.
2. **Menu core** (12 pts): S-041 → S-046 → S-043 → S-045.
3. **Editor depth** (17 pts): S-047 → S-048 → S-049 → S-042.
4. **Real menu on staging** (11 pts): S-241 → S-050 → S-051 → TD G-19. **Owner checkpoint A:** the real menu is on staging; the Owner types cake prices, switches products on and previews them.
5. **Email and passwords** (14 pts): S-024 → S-025 → S-026 → S-036.
6. **Team** (13 pts): S-027 → S-028 → S-029 → S-030.
7. **Roles and app shell** (15 pts): S-031 → S-032 → S-034 → S-035. **Owner checkpoint B:** invite a helper, helper signs in on a phone and cannot open Owner screens; install the app.
8. **Owner settings** (16 pts): S-058 → S-059 → S-056 → S-057. **Owner checkpoint C (sprint demo):** settings, content, availability and blocked dates entered for real.
9. Stretch: S-044 → S-052 → S-053 → S-060; then S-054 → S-055.

## Decisions (producer, 2026-11-11; standing instruction: decide routine choices and record them)
- **S-034 contract (as lead-backend + lead-frontend, coordination rule 5):** `admin/layout` loader adds `badges: { toReview: number }` (orders in `pending_approval` or `quote_needed`, uncapped; the "9+" cap is a view concern; default revalidation kept so the badge drops after Approve). Named `toReview` to match `admin/today` `counts.toReview`. Recorded in contracts.md v0.14; S-034 moved draft → ready and committed. Cost: one indexed count per admin page load, acceptable against the CPU watch (T3).
- **Menu before team in the build order.** Both are in the goal, but the menu is the Owner's real work (prices are the open item) and needs no new keys; team invites and reset emails need Resend on staging (see risks). Guards and the frame (batch 1) come first because everything depends on them.
- **S-044 Duplicate is stretch, not committed.** The goal can be met without it (S-241 loads all six cakes already), but it is first in stretch because it saves the Owner time on future cakes.
- **S-241 added** (production/stories/E-03/S-241-load-real-menu-staging.md, 3 pts): seeds the Owner's real menu from docs/content/menu-source/ through a manual staging-only workflow, insert-only so it never overwrites the Owner's edits. Placeholder-priced cakes are seeded Rs 0 and `hidden` so they cannot be ordered; cookies (real prices) are seeded available. Cookies use type `dessert`; emoji dropped from names; French left empty for the copywriter and Owner. It replaces E-03's "8 products / 12 photos / 2 promotions" sample-data gap for the menu part; the gallery and promotion sample data move with the stretch stories (or E-12) since real content replaces sample content.
- **One tech-debt item:** G-19 secret scan in CI, chosen because S-241 and S-047 bring the Storage service key into workflows. Sign-in rate limit TD is closed by S-023 itself.
- Carry-overs: none as build work. E-01 stories stay `review` until the Owner's phone test of the skeleton; any fix found there displaces stretch first, then batch 9.

## Risks / dependencies
- Resend not configured on staging (optional integration, ADR-0002 amendment 1) — invites (S-028) and reset emails (S-024..S-026) cannot be tried end to end. Mitigation: before batch 5, ask the Owner for `RESEND_API_KEY` and `EMAIL_FROM` for staging (docs/runbooks/deploy-keys.md section on Resend); meanwhile the stories are proven with the sender mocked, and outbox rows stay `pending` until the key exists.
- Supabase service key in the GitHub `staging` environment for S-241 photo upload — mitigation: the workflow names the missing secret; add it from deploy-keys.md before batch 4.
- Cake prices still placeholders — mitigation: cakes seeded hidden at Rs 0; Owner checkpoint A is where she types them. Vanilla and Pistachio still lack description and photo; they stay hidden until she sends them.
- ADR-0004 client-side basket in progress on the same files as checkout — mitigation: land or park ADR-0004 before batch 2 (S-043 changes how sold-out products behave in the basket); rebase S-043 on it.
- Phone-first editor complexity (S-048 option groups) against the 5-minute criterion — mitigation: time-box; the Owner's checkpoint A is the real-world test.
- Worker CPU (T3, accepted and monitored) — admin pages add a badge count and heavier editor loaders; mitigation: Server-Timing on the editor and menu list, re-run cpu-measure after batch 4.
- Owner review bandwidth is the true bottleneck — mitigation: three batched checkpoints (A, B, C) instead of per-story reviews.

## Daily log
<!-- One line per working session. -->
- 2026-11-11: sprint planned; S-034 contract resolved; S-241 written.
- 2026-11-12: batch 1 built (S-021, S-022, S-033, S-023 → review). Review (security-lead + ux-lead): every /admin loader and action guarded (route-guards.test walks routes.ts incl. .data; owner modules refuse Admins); rate limiter = Postgres fixed window in the existing table (no new infra, no ADR). Fixed: rate-limit buckets were never purged (now an hourly job); Sign out moved from the header to the end of More (design-system thumb zone: header read-only, less header height at 320 px). Left (Medium): no per-email cap across many IPs (spec is email + IP); Supabase Auth still rate-limits by the Worker's shared egress IP (tech-debt A5); e2e basket-instant cookie test can flake when a random line id contains "rs" (ADR-0004 owner).
- 2026-11-12: batch 2 built (S-041, S-046, S-043, S-045 → review; contract v0.18, v0.20 to v0.22; migrations 0002 `product.updated_by` and 0003 `storage_purge`, both expand-only, applied by the staging deploy). Review (security-lead + ux-lead): every new loader and action calls `requireAdmin` first (route-guards walks `menu/new` and `menu/:id`; policy row `product`); inputs parsed by zod; the Storage service key stays server-side with a 3 s timeout and failures queued, never surfaced. Fixed: the product editor had no loading state (spec: form skeleton) → skeleton after 300 ms like the menu list. Left (Low): a failed navigation keeps the frame's last data in the tab (the admin's own name and role, refreshed on the next good load); `/menu/<old slug>` is 404 until S-050 adds the redirect; Storage removal of real photos is proven with a double only (no product has Storage photos before S-047).
- 2026-11-12: batch 3 built (S-047, S-048, S-049, S-042 → review; contract v0.23 to v0.26; no migration: the schema already had photos, option groups and seasonal dates). Photos are compressed in the browser (WebP ≤ 1600 px, ≤ 300 kB, EXIF dropped; HEIC via a lazily loaded decoder), uploaded with signed URLs from the new resource route `POST /admin/uploads`, and re-checked on save (issued prefix, unused, size, magic bytes). Option groups keep their ids on save so baskets stay valid. Review (security-lead + ux-lead): uploads are typed and size-checked at signing, by the bucket and again on save; no client path reaches Storage unchecked; the service key stays server-side. Fixed: a stale-reorder alert stayed after Reload. Left (Low): orphan uploads need a cleanup job; no admin upload rate limit; AC9 of S-048 (5-minute phone session) still to run with a tester (production/test-sessions/S-048-option-group-timing.md).
- 2026-11-12: batch 4 built (S-050, S-051, S-241 → review; TD G-19 done; contract v0.27; no migration). Old product links answer 301 (cached an hour, so a slug taken back cannot loop in a browser); Preview reuses the customer page body and loader code; the real menu loads through the manual `seed-menu` workflow (staging environment only, insert-only, photos re-checked like an editor save). CI now runs a pinned gitleaks over the history and a client-bundle secret check. The staging smoke check uses the first product on `/api/menu` instead of `/menu/chocolate-cake` (hidden once the real menu loads).

## Review (filled at sprint end)
- Completed: — · Carried over: —
- Velocity: — · Notes → retrospective
