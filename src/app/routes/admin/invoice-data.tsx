import { t as translate } from "~/i18n/catalog.server";
import { ADMIN_PAGE_HEADERS, adminMiddleware } from "~/server/admin-page.server";
import { requireAdmin } from "~/server/auth.server";
import { clockContext } from "~/server/clock.server";
import { OrderId } from "~/server/contracts/admin";
import { requestDbContext } from "~/server/db.server";
import { invoiceDocument } from "~/server/services/invoice.server";
import type { Route } from "./+types/invoice-data";

/**
 * `admin/invoice-data` (GET /admin/orders/:id/invoice.json, S-127): the invoice document as JSON
 * for the PDF the browser builds (the Worker never renders it: 10 ms CPU). Any admin (Admin or
 * Owner); no session → the sign-in redirect, never data. Numbers the order on the first call
 * (idempotent: later calls return the same number and date). `private, no-store`.
 * → `{ ok: true, invoice: InvoiceDocument }`; unknown or malformed id → 404 `NOT_FOUND`.
 */
export const middleware: Route.MiddlewareFunction[] = adminMiddleware;

export async function loader(args: Route.LoaderArgs) {
  const me = await requireAdmin(args);
  const id = OrderId.safeParse(args.params.id);
  const db = args.context.get(requestDbContext).db;
  const invoice = id.success ? await invoiceDocument(db, id.data, args.context.get(clockContext).now()) : null;
  if (!invoice) {
    return Response.json({ ok: false, error: { code: "NOT_FOUND", message: translate("errors.codes.NOT_FOUND", me.locale) } }, { status: 404, headers: ADMIN_PAGE_HEADERS });
  }
  console.log(JSON.stringify({ level: "info", event: "invoice_prepared", invoiceNumber: invoice.number, locale: invoice.locale, actorRole: me.role }));
  return Response.json({ ok: true, invoice }, { headers: ADMIN_PAGE_HEADERS });
}
