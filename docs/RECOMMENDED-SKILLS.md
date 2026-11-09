# Recommended External Skills (dependencies)

The studio reuses proven public skills instead of re-writing them. They are
**optional**: every studio skill that uses one falls back to its own checklist
and tells you the dependency is missing. `/install-deps` installs them.

## Install

```text
/plugin marketplace add anthropics/skills
/plugin install example-skills@anthropic-agent-skills

/plugin marketplace add vercel-labs/agent-skills
# then install the skills listed below from that marketplace
```

Playwright MCP (browser automation for e2e, a11y and perf audits):

```bash
claude mcp add playwright -- npx @playwright/mcp@latest
```

## What is used where

| Skill | Source | Used by |
|---|---|---|
| `frontend-design` | anthropics/skills | `design-director`, `ui-designer`, `/brand-identity`, `/design-system`, `/wireframe` |
| `webapp-testing` | anthropics/skills | `test-engineer`, `/e2e`, `/smoke-check` |
| `theme-factory` | anthropics/skills | `/design-tokens` |
| `web-artifacts-builder` | anthropics/skills | `/prototype`, `/wireframe` (clickable mockups) |
| `mcp-builder` | anthropics/skills | `ai-features-engineer` |
| `claude-api` | anthropics/skills | `ai-features-engineer`, `/add-ai-feature` |
| `web-design-guidelines` | vercel-labs/agent-skills | `ux-lead`, `/ux-review`, `/a11y-audit` |
| `react-best-practices` | vercel-labs/agent-skills | React-family specialists, `/review-code` |
| `composition-patterns` | vercel-labs/agent-skills | `lead-frontend`, `ui-engineer` |
| `react-native-skills` | vercel-labs/agent-skills | `mobile-specialist` |
| `deploy-to-vercel` | vercel-labs/agent-skills | `hosting-platform-specialist` |

## Precedence

Project documents (`docs/design/brand-guide.md`, the design system, specs) and
your decisions override a dependency skill's defaults. A dependency's
guidance is input, not a verdict.
