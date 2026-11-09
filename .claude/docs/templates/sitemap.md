<!-- Template: sitemap | Filled by: /sitemap (ux-lead, content-lead, seo-specialist) | Output: docs/content/sitemap.md -->
# Sitemap & Information Architecture — [PRODUCT NAME]

Updated: [YYYY-MM-DD]
<!-- Decide URL conventions once: lowercase, hyphens, trailing slash [yes/no], locale prefix [/en/ or none]. -->
URL conventions: [CONVENTIONS]

## Public (marketing) — indexable
| Path | Page | Purpose / primary CTA | Target keyword / intent | Template | Owner |
|---|---|---|---|---|---|
| / | Home | [SIGN UP] | [KEYWORD] | landing | content-lead |
| /pricing | Pricing | [START TRIAL] | [PRODUCT pricing] | pricing | |
| /blog/[slug] | Article | [NEWSLETTER] | [VARIES] | article | |

## App (authenticated) — noindex
| Path | Screen | Purpose | Roles |
|---|---|---|---|
| /app | Dashboard | [PURPOSE] | [member, admin] |

## System pages
| Path | Page |
|---|---|
| /login, /signup, /reset-password | Auth |
| /404, /500 | Errors |
| /legal/privacy, /legal/terms, /legal/cookies | Legal |
| /sitemap.xml, /robots.txt | Crawlers |

## Navigation
- Primary nav: [ITEMS]
- Footer: [ITEMS]
- App nav: [ITEMS]

## Redirects
| From | To | Code | Reason |
|---|---|---|---|

## Hierarchy diagram
```
/
├── /features
├── /pricing
├── /blog
└── /app (auth)
```
