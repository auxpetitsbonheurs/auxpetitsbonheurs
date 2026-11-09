---
paths:
  - "docs/**"
---

# Documentation & Spec Rules

- Use the templates in `.claude/docs/templates/`; keep their section headings so skills can read by section
- Requirements carry stable IDs (`FR-012`) that stories and specs reference
- Mark assumptions and inferred content (e.g. from `/reverse-document`) explicitly
- A behaviour change in code updates the spec in the same change
- ADRs are immutable once accepted; supersede with a new ADR instead of editing
- Keep docs short; link rather than repeat
