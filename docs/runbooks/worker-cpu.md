# Runbook: measure Worker CPU time on staging (S-019, risk T3)

Question: does the free Workers plan's 10 ms CPU limit per request hold for the three hot
paths (checkout submit, `/basket` with price calculation, tracking page)? Result goes to
`docs/architecture/cpu-measurements.md`. Run by the Owner, or the developer with the Owner's
Cloudflare access. Nothing here buys or changes a plan.

What the tooling does: `npm run cpu:load` places real orders on **staging** (it refuses any
other site) and tags every measured request with `?cpu=cold` or `?cpu=warm`;
`npm run cpu:report` reads the CPU time of those requests from the logs and writes the report.
Each request also writes one structured log line (request id, route with tokens redacted,
status, duration).

## Before you start

- Staging is deployed and healthy (`docs/runbooks/deploy-keys.md`), and the sample product
  exists: `APP_ENV=staging DATABASE_URL='…' npm run seed:sample` (README "Sample product").
- On your computer, in `src/`: `npm ci`.
- Cloudflare access for `wrangler tail`: either `npx wrangler login` (bakery account, in the
  browser) or a token in your shell only: `export CLOUDFLARE_API_TOKEN=<CLOUDFLARE_API_TOKEN>`
  (the "Edit Cloudflare Workers" token from the deploy keys works). Never commit it.
- `export STAGING_URL=https://auxpetitsbonheurs-staging.<subdomain>.workers.dev`
- `export RUN=$(date +%F) && mkdir -p ../production/audits/worker-cpu-$RUN && export RAW=$(mktemp -d)`
  (`$RAW` is outside the repository: raw tail output holds full URLs, i.e. tracking tokens, and is never committed)

## Steps

1. Terminal A (keep it open for the whole run):
   `npx wrangler tail auxpetitsbonheurs-staging --format json > "$RAW/tail.jsonl"`
2. Cold samples: leave staging without traffic for at least 10 minutes, then in terminal B
   `npm run cpu:load -- --url "$STAGING_URL" --phase cold --count 1`.
   Repeat 5 times over the session, each after 10 idle minutes (5 cold rounds = 5 samples per path).
3. Warm samples: `npm run cpu:load -- --url "$STAGING_URL" --phase warm --count 50`
   (50 rounds = 50 samples per hot path, each submit with its own idempotency key).
   If a submit is refused because the date is unavailable, add `--date YYYY-MM-DD` with an open day.
4. Stop terminal A (Ctrl-C). Check the file has CPU numbers: `grep -c cpuTime "$RAW/tail.jsonl"`.
5. If that count is 0 (tail format changed): automatic invocation logs are off (they store
   tokens), so turn them on for staging only for the run: in `src/wrangler.jsonc` add
   `"observability": { "enabled": true, "logs": { "enabled": true, "invocation_logs": true } }`
   under `env.staging`, merge, repeat steps 2 and 3, then revert that change. Then Cloudflare
   dashboard → Workers & Pages → `auxpetitsbonheurs-staging` → Observability → Logs, filter on
   `cpu=`, and type each request's CPU time into a copy of `production/audits/worker-cpu-samples-template.csv`
   (`path` = `checkout-submit`, `basket` or `tracking`; `phase` = `cold` or `warm`; `cpu_ms`),
   saved as `../production/audits/worker-cpu-$RUN/samples.csv` (no URLs in it).
6. Write the report:
   `npm run cpu:report -- "$RAW/tail.jsonl" --date $RUN --env staging --samples-out ../production/audits/worker-cpu-$RUN/samples.csv`
   (or pass the typed `samples.csv` instead of the tail file). Then delete `$RAW`: `rm -r "$RAW"`. It prints `Overall: PASS`, `FAIL` or `PENDING` (a phase has no samples).
7. If `Overall: FAIL`: the report says which path and asks the Owner to decide (reduce the
   work, or Workers Paid at $5/month, which breaks NFR-009). Do not change the plan here.
8. If time to first byte also looks slow, consider Smart Placement (architecture "Data") in
   a separate change; enable it only if these numbers or TTFB justify it.
9. Commit `docs/architecture/cpu-measurements.md` and `production/audits/worker-cpu-$RUN/samples.csv` (path, phase, CPU only), then tick S-019 AC3
   (and AC2 with the measured tables) in `production/stories/E-01/S-019-worker-cpu-measurement.md`.

The test orders stay on staging as sample data (emails `cpu-test+<run>-<n>@example.com`).
