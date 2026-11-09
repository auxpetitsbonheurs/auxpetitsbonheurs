---
name: add-ai-feature
description: "Adds an LLM-powered feature (chat, generation, summarisation, extraction, classification, agent with tools, RAG over the product's data) with server-side keys, streaming, structured outputs, prompt-injection defences, cost limits and an eval set. Use when the product needs AI capabilities."
argument-hint: "<feature description>"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*), WebFetch
model: opus
---

# Add AI Feature

AI features must be useful, safe and affordable, and measured with evals. No
paid API calls happen without the user's explicit go-ahead; tests use recorded or
mocked responses.

## Inputs

- The feature description and its spec/PRD section
- `project.yaml → stack.ai`, `stack.database`, `stack.search`, `privacy.regions`
- If installed, the `claude-api` skill (current model IDs, SDK usage, tool use,
  prompt caching); otherwise fetch the provider's official docs. Never guess model IDs.

## Phases

### Phase 1: Shape the feature

Ask: what the user gives, what they get, what "good" looks like (3–5 concrete
examples), latency expectation (streaming?), and what must never happen. Decide
the pattern: single call with structured output, chat, RAG, or tool-using agent.

### Phase 2: Provider and model

If `stack.ai` is null, ask for the provider. Pick the model by task, latency and
cost; default to the provider's latest suitable models. Estimate cost per request
and per active user per month. ADR for a new vendor; `config-set.sh stack.ai=<value>`
after approval.

### Phase 3: Data, safety and privacy

- RAG: what sources, chunking, embeddings, vector store (pgvector by default),
  permission filtering at retrieval time (users only retrieve what they may read),
  citations back to sources.
- `security-lead`: prompt injection from retrieved/user content, tool misuse,
  data exfiltration via output links/markdown, over-broad tools. Tools with side
  effects require user confirmation.
- `privacy-compliance-specialist`: what personal data goes to the provider, retention,
  processor listing, disclosure to users.

### Phase 4: Plan

`ai-features-engineer` with the backend specialist:
- server-only SDK client; key in env (`.env.example` placeholder)
- versioned prompts in code; structured outputs (JSON schema / tool use) for anything parsed
- streaming endpoint with abort and timeout handling; UI with partial rendering and stop button
- per-user rate limits and quotas, token budgets, prompt caching where supported, usage logging
- eval set (`tests/evals/<feature>.jsonl`, 10–30 labelled cases) and a script to run it on demand
- tests with mocked model responses; no live calls in CI

Ask: stories (recommended) or direct implementation.

## Never

Ship keys to the client; let model output execute code or side effects unreviewed;
send data the privacy policy doesn't cover; run evals against paid APIs without the user's go.

## Next step

`/security-audit ai`, then `/analytics-plan` to measure the feature's use.
