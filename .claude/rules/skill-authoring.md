---
paths:
  - ".claude/skills/**"
---

# Skill Authoring Rules

- Follow `.claude/docs/skill-conventions.md`: frontmatter fields, body structure, canonical paths, story format
- `name` equals the folder name; `description` says what it does and when to use it (< 400 chars)
- `allowed-tools` lists only what the skill needs
- Questions go last in a reply; a skipped question is not consent
- Ask before writing; never commit, push, deploy, migrate shared databases or call paid APIs
- Reference templates, agents and scripts that exist; run `/skill-test <name>` after editing
