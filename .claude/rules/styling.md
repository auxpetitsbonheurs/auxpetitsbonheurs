---
paths:
  - "**/*.css"
  - "**/*.scss"
  - "**/tailwind.config.*"
  - "**/components/ui/**"
  - "**/globals.css"
  - "**/app.css"
---

# Styling Rules

- Tokens are the source of truth: `docs/design/tokens.json` → CSS variables → Tailwind theme. Change the token, not the call site
- Light and dark themes both pass WCAG 2.2 AA contrast (4.5:1 text, 3:1 UI and large text)
- Arbitrary Tailwind values (`w-[317px]`, `#3b82f6`) need a comment saying why a token does not fit
- Prefer composition (`cn()`, `cva` variants) over `@apply` sprawl
- Mobile-first breakpoints; layouts work from 320 px wide with no horizontal scroll
- Use logical properties (`ms-*`, `padding-inline`) so RTL works
- Never remove focus outlines without an equally visible `focus-visible` replacement
- Do not edit generated shadcn/ui components in ways that break Radix keyboard/ARIA behaviour
