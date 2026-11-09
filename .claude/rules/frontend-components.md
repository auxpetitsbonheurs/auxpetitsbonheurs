---
paths:
  - "**/components/**"
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/*.vue"
  - "**/*.svelte"
  - "**/*.astro"
---

# Frontend Component Rules

- Build from design-system primitives and tokens (`docs/design/design-system.md`); no hard-coded colours, spacing, radii or fonts
- Semantic HTML first: `<button>` for actions, `<a href>` for navigation, real `<label>`s, one `<h1>` per page, landmarks
- Every interactive element is keyboard-operable with a visible focus style; dialogs trap and restore focus
- Every image has `alt` (empty only if decorative); icon-only buttons have an accessible name
- Handle all four states: loading (skeleton, no layout shift), empty (with a next action), error (with recovery), success
- Server-render by default; mark client components at the smallest interactive leaf
- Never put secrets, server-only imports or database access in client code
- Props are typed; no `any`; variants via props, not copied components
- User-facing strings go through i18n when `i18n.locales` has more than one entry; never concatenate translated fragments
- Respect `prefers-reduced-motion`; no motion that conveys essential information alone
- Tests query by role/label/text (Testing Library), never by class or test-id unless no accessible handle exists
