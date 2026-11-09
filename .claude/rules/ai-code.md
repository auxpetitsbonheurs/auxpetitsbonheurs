---
paths:
  - "**/ai/**"
  - "**/llm/**"
  - "**/rag/**"
  - "**/prompts/**"
  - "**/agents/**"
  - "**/embeddings/**"
---

# AI Feature Rules

- Model API keys are server-side only; never exposed through public env prefixes
- Prompts are versioned in code; anything parsed uses structured output (JSON schema / tool use) and is validated
- Treat user input and retrieved documents as untrusted: they cannot grant tools, change instructions or reveal system prompts
- Tools with side effects (send, pay, delete) require explicit user confirmation
- Stream long responses; handle aborts, timeouts and provider errors gracefully
- Per-user rate limits and spend caps; log token usage per feature
- Only send personal data to providers the privacy policy covers; redact what the model does not need
- Prompt or model changes run the eval set first; record results
- Tests mock the model client; no paid API calls in CI
