# S-069: Gallery with occasion filter, lightbox and "Request something similar"
Status: ready
Epic: E-04-customer-site-browsing
Spec: docs/specs/features/catalogue-browsing.md#gallery-fr-009
Estimate: 3 pts
Owner: remix-specialist, tailwind-shadcn-specialist, accessibility-specialist

## Story
As a customer looking for ideas, I want to browse photos of past cakes by occasion and ask for something similar, so that I can start a custom request from a photo I love.

## Acceptance Criteria
- [ ] AC1 (FR-009): Given gallery photos, when `/gallery` loads, then a 3-column grid shows with blur-up placeholders and occasion chips (All plus single-select occasions) driven by `?occasion=`.
- [ ] AC2 (FR-009): Given occasion `birthday`, when selected, then only birthday photos show; given an occasion with no photos, then "No photos for this occasion yet." shows.
- [ ] AC3 (FR-009): Given a photo is tapped, when the lightbox opens (lazy-loaded), then it shows the large photo with caption (locale, EN fallback) and previous/next buttons; swipe also works but is never the only way.
- [ ] AC4 (FR-009): Given the lightbox is open, when Esc is pressed, then it closes and focus returns to the tapped thumbnail; focus is trapped while open.
- [ ] AC5 (FR-009): Given "Request something similar" on photo P, when pressed, then `/custom-cake?fromGallery=P` opens (the form itself and photo attach are E-08).
- [ ] AC6 (FR-009): Given JavaScript is disabled, when a thumbnail is pressed, then it opens the photo (link) and the "Request something similar" link still works.
- [ ] AC7 (FR-009): Given the gallery loader errors, when requested, then a section error with Retry shows.
- [ ] AC8 (NFR-002, NFR-006): Given the gallery at 320 px and 375 px, 200% zoom and keyboard-only, when thumbnails, lightbox, chips and buttons are used, then all are labelled with distinct names (each thumbnail "Open photo: <caption or occasion> 3 of 12"), >= 44 px, `prefers-reduced-motion` honoured, contrast AA per `docs/design/tokens.json`, no sideways scroll.

## Tests
- AC1 → src/app/routes/site/gallery.test.tsx
- AC2 → src/app/routes/site/gallery.test.ts
- AC3 → src/tests/e2e/browse-gallery.spec.ts
- AC4 → src/tests/e2e/browse-gallery.spec.ts
- AC5 → src/app/routes/site/gallery.test.tsx
- AC6 → src/tests/e2e/browse-gallery.spec.ts (JS off)
- AC7 → src/app/routes/site/gallery.test.tsx
- AC8 → src/tests/e2e/browse-gallery.spec.ts

## Notes
- FR-009 is Should, last to cut. The `/custom-cake` destination depends on E-08; until then AC5 asserts the link target only. Cross-epic dependency flagged.
- Swipe alternative required by epic scope.
