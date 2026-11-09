<!-- Template: design-system | Filled by: /design-system (design-director, ui-designer, tailwind-shadcn-specialist) | Output: docs/design/design-system.md -->
# Design System — [PRODUCT NAME]

Tokens: docs/design/tokens.json · Implementation: [components/ui/ (shadcn/ui) | PATH]

## Principles
1. [PRINCIPLE] — e.g. "Content first, chrome second"

## Foundations
<!-- Reference token names, never raw values. -->
- Colour roles: [background, foreground, primary, muted, accent, destructive, border, ring]
- Typography: [SCALE TOKENS + USAGE: h1–h4, body, small, mono]
- Spacing: [4px BASE SCALE]
- Radius / shadow / elevation: [TOKENS]
- Breakpoints: [sm 640, md 768, lg 1024, xl 1280]
- Motion: [DURATION + EASING TOKENS]; reduced motion: [BEHAVIOUR]
- Themes: [light, dark, …]

## Components
| Component | Source | Variants | States | Notes |
|---|---|---|---|---|
| Button | shadcn/ui | primary, secondary, ghost, destructive, link | default, hover, focus, active, disabled, loading | One primary per view |
| Input / Field | | | default, focus, error, disabled | Label always visible |
| [COMPONENT] | | | | |

## Patterns
- Forms: [LABEL, HINT, ERROR PLACEMENT; VALIDATION TIMING]
- Empty states: [ILLUSTRATION? COPY + PRIMARY ACTION]
- Loading: [SKELETONS VS SPINNERS; > 1s SHOWS PROGRESS]
- Errors: [INLINE, TOAST, PAGE-LEVEL]
- Navigation: [TOP NAV / SIDEBAR / MOBILE]

## Accessibility rules
- Contrast: text ≥ 4.5:1, UI ≥ 3:1 in every theme
- Visible focus ring token: [ring]
- Target size ≥ 24×24px (44 preferred)

## Adding a component
<!-- When is a new component justified vs a variant? Who approves (design-director)? -->
[RULES]

## Changelog
- [YYYY-MM-DD] [CHANGE]
