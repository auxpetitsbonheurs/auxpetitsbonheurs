// S-171 AC14, S-178 AC6: with a year of 12,000 orders the Sales loader answers p95 ≤ 500 ms and
// the CSV of the whole year streams to the end. Desktop project only (one seed of 12k rows),
// in a year no other spec uses.
import { signIn } from "./support/admin";
import { E2E_ACCOUNTS } from "./support/database";
import { expect, test } from "./support/fixtures";

const YEAR = 2051;
const ORDERS = 12_000;
const RANGE = `range=custom&from=${YEAR}-01-01&to=${YEAR}-12-31`;

test.skip(() => test.info().project.name !== "desktop-1280", "one seed of 12k orders is enough");
// Seeding 12k rows and 20 timed requests outlast the default test budget.
test.describe.configure({ timeout: 180_000 });

test("12k orders: sales p95 ≤ 500 ms and the year CSV streams completely", async ({ page, db }) => {
  const [customer] = await db<{ id: string }[]>`insert into customer (name, phone) values ('Perf Customer', '+23050000001') returning id`;
  const [product] = await db<{ id: string }[]>`select id from product limit 1`;
  const [counter] = await db<{ value: number }[]>`update counter set value = value + ${ORDERS} where name = 'order_number' returning value`;
  const first = counter!.value - ORDERS + 1;
  await db`
    insert into orders (number, source, status, customer_id, contact_name, contact_phone, fulfilment, address, fulfil_on, time_window,
      items_total_rs, total_rs, paid, paid_at, locale, tracking_token)
    select ${first} + n, (array['website','manual','custom_request'])[1 + n % 3]::order_source,
      (case when n % 10 = 0 then 'approved' else 'completed' end)::order_status, ${customer!.id}, 'Perf ' || n, '+23050000001',
      (case when n % 2 = 0 then 'pickup' else 'delivery' end)::fulfilment, (case when n % 2 = 0 then null else '1 Perf Road' end), (${`${YEAR}-01-01`}::date + (n % 365)),
      '{"id":"am","start":"09:00","end":"12:00","label":{"en":"Morning"}}', 900 + n % 50, 900 + n % 50, n % 7 <> 0,
      case when n % 7 <> 0 then now() end, 'en', 'perf-' || ${YEAR} || '-' || n
    from generate_series(0, ${ORDERS - 1}) n`;
  await db`
    insert into order_item (order_id, product_id, name_en, original_base_price_rs, unit_base_price_rs, quantity, line_total_rs)
    select id, ${product?.id ?? null}, 'Perf cake', 900, 900, 1, 900 from orders where tracking_token like ${`perf-${YEAR}-%`}`;
  await db`analyze orders`;
  await db`analyze order_item`;

  await signIn(page, E2E_ACCOUNTS.owner, "/admin/sales");
  // The Worker's own time for the request (Server-Timing `app`), so a busy test runner's
  // queueing is not counted; wall clock only if the header is missing. Three warm-up requests.
  const serverMs = async () => {
    const started = Date.now();
    const response = await page.request.get(`/admin/sales.data?${RANGE}`);
    expect(response.status()).toBe(200);
    const app = /(?:^|,\s*)app;dur=([\d.]+)/.exec(response.headers()["server-timing"] ?? "");
    return app ? Number(app[1]) : Date.now() - started;
  };
  for (let i = 0; i < 3; i += 1) await serverMs();
  const timings: number[] = [];
  for (let i = 0; i < 20; i += 1) timings.push(await serverMs());
  timings.sort((a, b) => a - b);
  const p95 = timings[Math.ceil(timings.length * 0.95) - 1]!;
  console.log(`sales loader at ${ORDERS} orders: p50 ${timings[9]} ms, p95 ${p95} ms`);
  expect(p95).toBeLessThanOrEqual(500);

  const csv = await page.request.get(`/admin/sales.csv?${RANGE}`, { timeout: 60_000 });
  expect(csv.status()).toBe(200);
  const text = await csv.text();
  const orders = text.split("\r\n\r\n").find((block) => block.startsWith("Orders"))!.split("\r\n").filter(Boolean);
  expect(orders.length - 2).toBe(ORDERS - ORDERS / 10);
});
