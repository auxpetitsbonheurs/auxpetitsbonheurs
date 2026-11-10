# E-03: Menu and content management

Status: planned · Milestone: MVP
PRD: FR-061, FR-062, FR-063, FR-064, FR-066, FR-067 · Specs: docs/specs/features/admin-menu-content.md, pricing-availability-promotions.md (promotion lifecycle)
Release phase: 2 Menu and content management

## Goal
The bakery manages products, promotions, gallery, availability rules and all site settings from a phone, with no developer.

## Success measure
Phase 2 exit: an admin creates a cake with sizes, flavours, add-ons and a message field from a phone in under 5 minutes. Sample data loaded: 8 products over 4 types, 12 gallery photos, 1 live and 1 scheduled promotion.

## Scope
- In: menu list, reorder, duplicate, hide, sold out (FR-061); product editor with EN/FR text, 1-5 photos shrunk before upload (FR-029 limits shared with E-08), option groups, seasonal dates, preview as customer (FR-062); renaming a product writes `product_slug_history` rows; promotions CRUD and automatic scheduling (FR-063); gallery upload and tagging (FR-064); Availability, Owner only (FR-066); Settings, Owner only, including FAQ and policies with cancellation and storage text (FR-067). A11y acceptance criteria on the product editor and drag-reorder (keyboard alternative).
- Out: customer-facing display and price rules (E-04, E-05).

## Stories
| ID | Title | Status | Estimate |
|---|---|---|---|
| [S-041](../stories/E-03/S-041-menu-list-by-type.md) | Menu list grouped by type | ready | 3 |
| [S-042](../stories/E-03/S-042-reorder-products.md) | Reorder products within a type | ready | 5 |
| [S-043](../stories/E-03/S-043-hide-and-sold-out.md) | Hide a product or mark it sold out | ready | 2 |
| [S-044](../stories/E-03/S-044-duplicate-product.md) | Duplicate a product as a starting point | ready | 3 |
| [S-045](../stories/E-03/S-045-delete-product.md) | Delete a product safely | ready | 2 |
| [S-046](../stories/E-03/S-046-product-editor-basics.md) | Create and edit a product's basic details | ready | 5 |
| [S-047](../stories/E-03/S-047-product-photos.md) | Add up to five product photos from the phone | ready | 5 |
| [S-048](../stories/E-03/S-048-option-groups.md) | Add sizes, flavours, add-ons and a message field to a product | ready | 5 |
| [S-049](../stories/E-03/S-049-seasonal-dates.md) | Set seasonal dates on a product | ready | 2 |
| [S-050](../stories/E-03/S-050-slug-history-redirect.md) | Renamed product links keep working | ready | 3 |
| [S-051](../stories/E-03/S-051-preview-as-customer.md) | Preview a product as a customer would see it | ready | 3 |
| [S-052](../stories/E-03/S-052-promotions-list-lifecycle.md) | Promotions list with automatic Scheduled, Live and Ended | ready | 3 |
| [S-053](../stories/E-03/S-053-promotion-editor.md) | Create and edit a promotion with discounts | ready | 5 |
| [S-054](../stories/E-03/S-054-gallery-upload-tag.md) | Upload gallery photos and tag them by occasion | ready | 5 |
| [S-055](../stories/E-03/S-055-gallery-caption-reorder-delete.md) | Caption, reorder and delete gallery photos | ready | 3 |
| [S-056](../stories/E-03/S-056-availability-rules.md) | Owner sets notice days, closed days and time windows | ready | 5 |
| [S-057](../stories/E-03/S-057-blocked-dates.md) | Owner blocks days or ranges with a private reason | ready | 3 |
| [S-058](../stories/E-03/S-058-settings-business.md) | Owner edits delivery fee, contacts, Juice number and business rules | ready | 5 |
| [S-059](../stories/E-03/S-059-settings-site-content.md) | Owner edits homepage, About, FAQ, policies and privacy text | ready | 3 |
| [S-060](../stories/E-03/S-060-whatsapp-templates.md) | Owner edits WhatsApp message templates with a live preview | ready | 3 |

Total: 73 points (S-041..S-060). Gap: the success measure's sample data (8 products over 4 types, 12 gallery photos, 1 live and 1 scheduled promotion) has no story yet; the number block S-041..S-060 is full, so it needs a new story (for example "Load launch sample data", extending `seed:sample` from S-011) with a number allocated by the orchestrator.

## Dependencies
- E-01, E-02 (roles for Owner-only screens).

## Risks
- Phone-first editor complexity (option groups); time-box against the 5-minute criterion.
- Free storage limit: 1 GB photos, 300 kB target (NFR-009).
