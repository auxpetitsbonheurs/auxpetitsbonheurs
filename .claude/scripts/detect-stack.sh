#!/usr/bin/env bash
# detect-stack.sh [dir] — guesses the stack from manifests. Prints `key: value`
# rows (only for what it finds) plus `evidence:` rows. Observations only.
dir="${1:-.}"; cd "$dir" 2>/dev/null || exit 0
has() { [ -f package.json ] && grep -q "\"$1\"" package.json; }
say() { echo "$1: $2"; }
pm=""
[ -f pnpm-lock.yaml ] && pm=pnpm; [ -f yarn.lock ] && pm=${pm:-yarn}
{ [ -f bun.lockb ] || [ -f bun.lock ]; } && pm=${pm:-bun}; [ -f package-lock.json ] && pm=${pm:-npm}
[ -f uv.lock ] && pm=${pm:-uv}; [ -f poetry.lock ] && pm=${pm:-poetry}
[ -f go.mod ] && pm=${pm:-go}; [ -f composer.json ] && pm=${pm:-composer}; [ -f Gemfile ] && pm=${pm:-bundler}
[ -n "$pm" ] && say package_manager "$pm"

if [ -f package.json ]; then
  { has typescript || [ -f tsconfig.json ]; } && say language typescript || say language javascript
  fe=""
  has next && fe=nextjs; has nuxt && fe=nuxt; has @sveltejs/kit && fe=sveltekit; has astro && fe=astro
  has @angular/core && fe=angular; has @solidjs/start && fe=solidstart; has @builder.io/qwik && fe=qwik
  { has @remix-run/react || has @react-router/dev; } && fe=remix
  [ -n "$fe" ] && say frontend "$fe"
  be=""
  has express && be=express; has fastify && be=fastify; has @nestjs/core && be=nestjs; has hono && be=hono
  has @supabase/supabase-js && be=${be:-supabase}; has firebase && be=${be:-firebase}
  [ -z "$be" ] && [ -n "$fe" ] && be=native
  [ -n "$be" ] && say backend "$be"
  orm=""; has prisma && orm=prisma; has @prisma/client && orm=prisma; has drizzle-orm && orm=drizzle; has mongoose && orm=mongoose
  [ -n "$orm" ] && say orm "$orm"
  db=""; { has pg || has postgres || has @neondatabase/serverless || grep -qs 'provider *= *"postgresql"' prisma/schema.prisma; } && db=postgres
  { has mongodb || has mongoose; } && db=mongodb
  [ -n "$db" ] && say database "$db"
  { has tailwindcss; } && { [ -f components.json ] && say styling tailwind-shadcn || say styling tailwind; }
  for p in @clerk/nextjs:clerk next-auth:authjs @auth/core:authjs better-auth:better-auth lucia:lucia; do has "${p%%:*}" && { say auth "${p#*:}"; break; }; done
  for p in stripe:stripe @paddle/paddle-js:paddle @lemonsqueezy/lemonsqueezy.js:lemonsqueezy; do has "${p%%:*}" && { say payments "${p#*:}"; break; }; done
  for p in next-sanity:sanity @sanity/client:sanity payload:payload @strapi/strapi:strapi contentful:contentful; do has "${p%%:*}" && { say cms "${p#*:}"; break; }; done
  for p in @anthropic-ai/sdk:anthropic openai:openai ai:multi; do has "${p%%:*}" && { say ai "${p#*:}"; break; }; done
  for p in resend:resend postmark:postmark @sendgrid/mail:sendgrid; do has "${p%%:*}" && { say email "${p#*:}"; break; }; done
  for p in posthog-js:posthog plausible-tracker:plausible; do has "${p%%:*}" && { say analytics "${p#*:}"; break; }; done
  has @sentry/ && say observability sentry
  { has bullmq || has ioredis || has redis; } && say cache_queue redis
  has vitest && say test_unit vitest; has jest && say test_unit jest
  has @playwright/test && say test_e2e playwright; has cypress && say test_e2e cypress
fi
if [ -f pyproject.toml ] || [ -f requirements.txt ]; then
  say language python
  grep -qis fastapi pyproject.toml requirements.txt && say backend fastapi
  grep -qis django pyproject.toml requirements.txt && say backend django
  grep -qis sqlalchemy pyproject.toml requirements.txt && say orm sqlalchemy
  grep -qis celery pyproject.toml requirements.txt && say cache_queue celery
  say test_unit pytest
fi
[ -f go.mod ] && { say language go; say backend go; say test_unit go-test; }
[ -f composer.json ] && grep -q laravel/framework composer.json && { say language php; say backend laravel; say orm eloquent; say test_unit phpunit; }
[ -f Gemfile ] && grep -q "rails" Gemfile && { say language ruby; say backend rails; say orm activerecord; say test_unit rspec; }
[ -d supabase ] && say backend supabase
{ [ -f firebase.json ] || [ -f firestore.rules ]; } && say backend firebase
[ -f vercel.json ] && say hosting vercel; [ -f netlify.toml ] && say hosting netlify
{ [ -f wrangler.toml ] || [ -f wrangler.jsonc ]; } && say hosting cloudflare
[ -f fly.toml ] && say hosting fly; [ -f render.yaml ] && say hosting render; [ -f railway.json ] && say hosting railway
{ [ -d terraform ] || ls ./*.tf >/dev/null 2>&1; } && say evidence "terraform files present"
[ -f Dockerfile ] && say evidence "Dockerfile present"
{ [ -f docker-compose.yml ] || [ -f compose.yaml ]; } && say evidence "docker compose present"
[ -d .github/workflows ] && say evidence "GitHub Actions workflows present"
for d in src app apps packages; do [ -d "$d" ] && say evidence "code dir: $d"; done
exit 0
