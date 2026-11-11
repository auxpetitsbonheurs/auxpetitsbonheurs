// Sends tagged requests to the three hot paths (S-019, risk T3) so their CPU time can be read
// from Workers Logs / `wrangler tail`. Each round: add the sample product, GET /basket
// (measured), POST the order with its own idempotency key (measured), GET /t/<token> (measured).
// Creates real orders: staging or a local build only. Prints counts, never tokens.
// Usage: npm run cpu:load -- --url https://auxpetitsbonheurs-staging.<subdomain>.workers.dev \
//          --phase warm --count 50 [--date YYYY-MM-DD] [--product chocolate-cake]
// Runs with Node's built-in TypeScript type stripping (Node >= 22.18).
import { parseArgs } from "node:util";
import { type Phase, assertMeasurableTarget, cookiePair, inputValue, orderForm, tagged, tokenFromLocation } from "../app/lib/cpu-load.ts";

const { values } = parseArgs({
  options: {
    url: { type: "string" },
    phase: { type: "string", default: "warm" },
    count: { type: "string", default: "50" },
    date: { type: "string" },
    product: { type: "string", default: "chocolate-cake" },
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

async function call(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { redirect: "manual", ...init });
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
