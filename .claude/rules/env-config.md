---
paths:
  - "**/env.ts"
  - "**/env.mjs"
  - "**/env.js"
  - "**/config/**"
  - "**/settings.py"
  - ".env.example"
  - "**/runtimeConfig*"
---

# Environment & Config Rules

- Every variable is validated at startup with a schema (t3-env, zod, pydantic-settings); the app fails fast on missing values
- Every variable is documented in `.env.example` with a placeholder and a comment; never a real value
- Public prefixes (`NEXT_PUBLIC_`, `VITE_`, `PUBLIC_`, `NUXT_PUBLIC_`, `EXPO_PUBLIC_`) only for values safe to show anyone
- Separate keys per environment; production secrets live in the host's secret store
- Feature flags and budgets come from config, not scattered literals
