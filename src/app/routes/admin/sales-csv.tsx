import { z } from "zod";
import { formatOrderNumber } from "~/domain/order-number";
import { ORDER_SOURCES, SALES_RANGES, resolveSalesRange } from "~/domain/sales";
import { todayMU } from "~/domain/time";
import { t } from "~/i18n/catalog.server";
import { CSV_BOM, csvRow } from "~/lib/csv";
import { adminMiddleware } from "~/server/admin-page.server";
import { requireAdmin } from "~/server/auth.server";
import { clockContext } from "~/server/clock.server";
import { MuDate } from "~/server/contracts/shared";
import { type Executor, requestDbContext } from "~/server/db.server";
import { type DateRange, type SalesReport, completedOrdersPage, salesReport, unpaidOrdersPage } from "~/server/repos/sales.server";
import type { Route } from "./+types/sales-csv";

/**
 * `admin/sales-csv` (GET /admin/sales.csv, S-178, S-179, FR-069): the Sales summary as a CSV
 * for Excel. Admin or Owner session (anonymous and customers get the sign-in redirect, never
 * data); the query is zod-validated; responses are `private, no-store` (admin middleware).
 * Sections Summary, Top products, By source, Unpaid (the only place a customer name appears,
 * never a phone or email) and Orders (one row per completed order, so totals reconcile).
 * Streamed page by page, so a year of orders never builds one huge string.
 */
export const middleware: Route.MiddlewareFunction[] = adminMiddleware;

const PAGE = 1000;

const Query = z.object({
  range: z.enum(SALES_RANGES).default("month"),
  from: MuDate.optional(),
  to: MuDate.optional(),
});

function validationFailed(message: string): Response {
  return Response.json({ ok: false, error: { code: "VALIDATION_FAILED", message } }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
}

/** The fixed sections, built from the same report as the screen (S-178 AC2). */
function headSections(report: SalesReport): string {
  return [
    csvRow(["Summary"]),
    csvRow(["revenue", "orders", "average", "delivery_count", "delivery_revenue", "pickup_count", "pickup_revenue"]),
    csvRow([report.revenueRs, report.orderCount, report.averageRs, report.delivery, report.deliveryRevenueRs, report.pickup, report.pickupRevenueRs]),
    "\r\n",
    csvRow(["Top products"]),
    csvRow(["rank", "product", "units", "revenue"]),
    ...report.top5.map((row, i) => csvRow([i + 1, row.name, row.quantity, row.revenueRs])),
    "\r\n",
    csvRow(["By source"]),
    csvRow(["source", "revenue"]),
    ...ORDER_SOURCES.map((source) => csvRow([source, report.bySource[source]])),
    "\r\n",
    csvRow(["Unpaid"]),
    csvRow(["number", "customer", "status", "date", "total"]),
  ].join("");
}

/** Pages of rows after a keyset (order number) until a short page. */
async function* pages<T>(fetch: (after: number | null) => Promise<T[]>, key: (row: T) => number): AsyncGenerator<T[]> {
  let after: number | null = null;
  for (;;) {
    const rows = await fetch(after);
    if (rows.length > 0) yield rows;
    if (rows.length < PAGE) return;
    after = key(rows.at(-1)!);
  }
}

async function* csvChunks(db: Executor, range: DateRange, report: SalesReport): AsyncGenerator<string> {
  yield CSV_BOM + headSections(report);
  for await (const rows of pages((after) => unpaidOrdersPage(db, range, after, PAGE), (row) => row.sequence)) {
    yield rows.map((row) => csvRow([row.number, row.contactName, row.status, row.fulfilOn, row.totalRs])).join("");
  }
  yield csvRow(["total", null, null, null, report.unpaidTotalRs]) + "\r\n" + csvRow(["Orders"]);
  yield csvRow(["number", "date", "source", "fulfilment", "items_rs", "delivery_fee_rs", "total_rs", "paid"]);
  for await (const rows of pages((after) => completedOrdersPage(db, range, after, PAGE), (row) => row.number)) {
    yield rows
      .map((row) => csvRow([formatOrderNumber(row.numberPrefix ?? "", row.number), row.fulfilOn, row.source, row.fulfilment, row.itemsTotalRs, row.deliveryFeeRs, row.totalRs, row.paid]))
      .join("");
  }
}

function stream(chunks: AsyncGenerator<string>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await chunks.next();
      if (done) controller.close();
      else controller.enqueue(encoder.encode(value));
    },
    async cancel() {
      await chunks.return(undefined);
    },
  });
}

export async function loader(args: Route.LoaderArgs) {
  // Thrown, like every admin module: anonymous visitors and customers get the sign-in redirect, never data.
  const me = await requireAdmin(args);
  const parsed = Query.safeParse(Object.fromEntries(args.url.searchParams));
  const today = todayMU(args.context.get(clockContext).now());
  const resolved = parsed.success ? resolveSalesRange(parsed.data, today) : null;
  if (!resolved?.ok) {
    const problem = resolved?.problem ?? "invalid";
    return validationFailed(t(`admin.sales.invalid.${problem}`, me.locale));
  }
  const db = args.context.get(requestDbContext).db;
  const report = await salesReport(db, resolved, me.locale);
  console.log(JSON.stringify({ level: "info", event: "sales_exported", range: resolved.range, rows: report.orderCount }));
  return new Response(stream(csvChunks(db, resolved, report)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="apb-sales-${resolved.from}_${resolved.to}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
