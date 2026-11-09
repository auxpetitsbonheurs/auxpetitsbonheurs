---
name: add-realtime
description: "Adds live features (notifications, live dashboards, presence, chat, collaborative editing) via SSE, WebSockets or a managed service (Supabase Realtime, Pusher, Ably, Liveblocks), with authorised channels, reconnects and scale-out. Use when something must update without a page reload."
argument-hint: "<feature description>"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*)
model: sonnet
---

# Add Realtime

Adds liveness only where it pays for itself. First question: would polling,
revalidation on focus, or optimistic UI be enough?

## Inputs

- The feature and its spec
- `project.yaml → stack.realtime`, `stack.hosting`, `stack.backend`, `stack.cache_queue`

## Phases

### Phase 1: Is realtime needed?

`realtime-engineer` compares: polling/revalidate (simplest), SSE (server → client),
WebSockets (bidirectional), managed service (serverless hosting, presence, CRDT
collaboration). Note hosting limits: serverless functions on Vercel/Netlify do not
hold long-lived WebSockets; use a managed service or a separate long-running service
(Fly, Railway, Render, Durable Objects on Cloudflare). Recommend one; ask.

### Phase 2: Record

If `stack.realtime` is null or changes: ADR, then `config-set.sh stack.realtime=<value>` after approval.

### Phase 3: Design

- channels/rooms naming and **server-side authorisation of every subscription**
- message schema (typed, versioned), size limits, per-connection rate limits
- delivery: at-least-once with idempotent handlers; resume from last event ID
- scale-out: Redis pub/sub, Postgres LISTEN/NOTIFY or the managed broker
- UI: connection state indicator, reconnect with backoff, tab sleep/wake handling
- collaboration: Yjs/Automerge or Liveblocks; never hand-rolled OT

`security-lead` reviews channel authorisation and data exposure.

### Phase 4: Plan and build

Tests: unit for message handlers, integration for subscription authz (wrong user is
rejected), Playwright with two browser contexts to verify live updates.
Ask: stories (recommended) or direct implementation.

## Next step

`/load-test` for the realtime endpoint before launch.
