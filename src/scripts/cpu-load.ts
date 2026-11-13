// Sends tagged requests to the three hot paths (S-019, risk T3) so their CPU time can be read
// from Workers Logs / `wrangler tail`. Each round: add the basket lines (not measured), GET
// /basket (measured), POST the order with its own idempotency key (measured), GET /t/<token>
// (measured). Creates real orders: staging or a local build only. Prints counts, never tokens.
// Usage: npm run cpu:load -- --url https://auxpetitsbonheurs-staging.<subdomain>.workers.dev \
//          --phase warm --count 50 [--date YYYY-MM-DD] [--product chocolate-cake] [--lines 10]
// --lines N (S-097): each round's basket holds N distinct lines planned from /api/menu (every
// orderable product in turn, with distinct options or cake messages); --product is then unused.
// Runs with Node's built-in TypeScript type stripping (Node >= 22.18).
import { appendFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { type Phase, type PlanProduct, assertMeasurableTarget, basketLinePlan, cookiePair, inputValue, orderForm, tagged, tokenFromLocation } from "../app/lib/cpu-load.ts";

const { values } = parseArgs({
  options: {
    url: { type: "string" },
    phase: { type: "string", default: "warm" },
    count: { type: "string", default: "50" },
    date: { type: "string" },
    product: { type: "string", default: "chocolate-cake" },
    lines: { type: "string", default: "1" },
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
const lineCount = Number(values.lines);
if (!Number.isInteger(lineCount) || lineCount < 1 || lineCount > 10) throw new Error("--lines must be a whole number from 1 to 10");
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

interface Line {
  path: string;
  fields: URLSearchParams;
}

/** Adds every planned line in turn (not measured), carrying the basket cookie; returns it. */
async function fillBasket(lines: readonly Line[]): Promise<string> {
  let cookie: string | undefined;
  for (const line of lines) {
    const added = await call(new URL(line.path, base).toString(), { method: "POST", body: line.fields, headers: cookie ? { Cookie: cookie } : {} });
    cookie = cookiePair(added.headers.getSetCookie(), "apb_basket") ?? cookie;
    if (!cookie || added.status >= 400) throw new Error(`Add to basket (${line.path}) answered ${added.status} without a basket cookie`);
  }
  return cookie!;
}

async function round(index: number, lines: readonly Line[]): Promise<void> {
  const cookie = await fillBasket(lines);
  const basket = await call(tagged(base!, "/basket", phase), { headers: { Cookie: cookie } });
  const form = orderForm({ basketHtml: await basket.text(), date, runId, index });
  const submitted = await call(tagged(base!, "/basket", phase), { method: "POST", body: form, headers: { Cookie: cookie } });
  const token = tokenFromLocation(submitted.headers.get("Location"));
  if (submitted.status !== 302 || !token) throw new Error(`Submit ${index + 1} answered ${submitted.status} (try another --date)`);
  const tracking = await call(tagged(base!, `/t/${token}`, phase));
  if (tracking.status !== 200) throw new Error(`Tracking ${index + 1} answered ${tracking.status}`);
}

/** The lines each round adds: the one --product (default), or --lines N planned from the menu. */
async function plannedLines(): Promise<Line[]> {
  if (lineCount === 1) {
    const productPage = await (await call(new URL(productPath, base).toString())).text();
    const productId = inputValue(productPage, "productId");
    if (!productId) throw new Error(`No orderable product at ${productPath}: run seed:sample on staging`);
    return [{ path: productPath, fields: new URLSearchParams({ intent: "addToBasket", productId, quantity: "1" }) }];
  }
  const menu = (await (await call(new URL("/api/menu", base).toString())).json()) as { data: { products: (PlanProduct & { slug: string })[] } };
  const slugs = new Map(menu.data.products.map((p) => [p.id, p.slug]));
  return basketLinePlan(menu.data.products, lineCount).map(({ fields }) => ({
    path: `/menu/${encodeURIComponent(slugs.get(fields.get("productId")!)!)}`,
    fields,
  }));
}

const lines = await plannedLines();
for (let i = 0; i < count; i += 1) await round(i, lines);
console.log(`cpu:load ${phase}: ${count} rounds (${lines.length}-line basket, submit, tracking) against ${new URL(base).host}, run ${runId}, date ${date}`);
