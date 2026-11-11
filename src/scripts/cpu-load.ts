// Sends tagged requests to the three hot paths (S-019, risk T3) so their CPU time can be read
// from Workers Logs / `wrangler tail`. Each round: add the sample product, GET /basket
// (measured), POST the order with its own idempotency key (measured), GET /t/<token> (measured).
// Creates real orders: staging or a local build only. Prints counts, never tokens.
// Usage: npm run cpu:load -- --url https://auxpetitsbonheurs-staging.<subdomain>.workers.dev \
//          --phase warm --count 50 [--date YYYY-MM-DD] [--product chocolate-cake]
// Runs with Node's built-in TypeScript type stripping (Node >= 22.18).
import { appendFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { type Phase, assertMeasurableTarget, cookiePair, inputValue, orderForm, tagged, tokenFromLocation } from "../app/lib/cpu-load.ts";

const { values } = parseArgs({
  options: {
    url: { type: "string" },
    phase: { type: "string", default: "warm" },
    count: { type: "string", default: "50" },
    date: { type: "string" },
    product: { type: "string", default: "chocolate-cake" },
    "timeouts-out": { type: "string" },
  },
});
const base = values.url ?? process.env.STAGING_URL;
if (!base) throw new Error("Pass --url or set STAGING_URL");
assertMeasurableTarget(base);
const phase = values.phase as Phase;
if (phase !== "cold" && phase !== "warm") throw new Error("--phase must be cold or warm");
const count = Number(values.count);
if (!Number.isInteger(count) || count < 1 || count > 200) throw new Error("--count must be a whole number from 1 to 200");
// Default: a week ahead, past any notice rule (override with --date if that day is blocked).
const date = values.date ?? new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
const runId = Date.now().toString(36);
const productPath = `/menu/${values.product}`;

/** No request may hang the run: after this long, fail naming the route (never the token). */
const REQUEST_TIMEOUT_MS = 15_000;

function routeOf(url: string): string {
  return new URL(url).pathname.replace(/^(\/(?:fr\/)?t\/)[^/]+/, "$1[redacted]");
}

async function call(url: string, init: RequestInit = {}): Promise<Response> {
  const label = `${init.method ?? "GET"} ${routeOf(url)}`;
  const startedAt = Date.now();
  // One JSON line per failed request (route name only, no query or token) for cpu-measure's
  // diagnostics: a timeout has no status, a non-2xx/3xx answer records its status.
  const record = (status?: number) => {
    if (values["timeouts-out"]) appendFileSync(values["timeouts-out"], `${JSON.stringify({ route: label, startedAt, endedAt: Date.now(), status })}\n`);
  };
  try {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), ...init });
    if (response.status < 200 || response.status >= 400) record(response.status);
    return response;
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      record();
      throw new Error(`${label} got no response within ${REQUEST_TIMEOUT_MS / 1000} s`, { cause: error });
    }
    throw new Error(`${label} failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

async function round(index: number, productId: string): Promise<void> {
  const added = await call(new URL(productPath, base).toString(), {
    method: "POST",
    body: new URLSearchParams({ intent: "addToBasket", productId, quantity: "1" }),
  });
  const cookie = cookiePair(added.headers.getSetCookie(), "apb_basket");
  if (!cookie) throw new Error(`Add to basket answered ${added.status} without a basket cookie`);
  const basket = await call(tagged(base!, "/basket", phase), { headers: { Cookie: cookie } });
  const form = orderForm({ basketHtml: await basket.text(), date, runId, index });
  const submitted = await call(tagged(base!, "/basket", phase), { method: "POST", body: form, headers: { Cookie: cookie } });
  const token = tokenFromLocation(submitted.headers.get("Location"));
  if (submitted.status !== 302 || !token) throw new Error(`Submit ${index + 1} answered ${submitted.status} (try another --date)`);
  const tracking = await call(tagged(base!, `/t/${token}`, phase));
  if (tracking.status !== 200) throw new Error(`Tracking ${index + 1} answered ${tracking.status}`);
}

const productPage = await (await call(new URL(productPath, base).toString())).text();
const productId = inputValue(productPage, "productId");
if (!productId) throw new Error(`No orderable product at ${productPath}: run seed:sample on staging`);
for (let i = 0; i < count; i += 1) await round(i, productId);
console.log(`cpu:load ${phase}: ${count} rounds (basket, submit, tracking) against ${new URL(base).host}, run ${runId}, date ${date}`);
