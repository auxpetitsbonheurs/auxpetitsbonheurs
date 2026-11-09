---
paths:
  - "infra/**"
  - "terraform/**"
  - "**/*.tf"
  - "**/Dockerfile"
  - "**/docker-compose*.yml"
  - "**/compose*.yaml"
  - ".github/workflows/**"
  - "**/vercel.json"
  - "**/netlify.toml"
  - "**/wrangler.toml"
  - "**/fly.toml"
  - "**/render.yaml"
---

# Infrastructure Rules

- Infrastructure is code, reviewed like code; `plan` output is shown before anyone applies it
- Applying, deploying or destroying is the user's call: print the command, do not run it
- Least privilege IAM; CI authenticates with OIDC, not long-lived keys
- No secrets in Dockerfiles, compose files, workflow YAML or Terraform variables; use secret stores
- Docker: multi-stage builds, pinned base images, non-root user, health check, `.dockerignore`
- CI: lockfile-respecting installs with cache; lint → typecheck → test → build; pin third-party actions to a SHA or major version
- Tag every cloud resource with project, environment and owner
