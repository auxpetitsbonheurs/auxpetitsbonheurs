import { ChevronLeft, Printer } from "lucide-react";
import { data } from "react-router";
import { AdminErrorBoundary } from "~/components/admin/admin-states";
import { InvoiceSheet } from "~/components/admin/invoice-sheet";
import { Button } from "~/components/ui/button";
import { t as translate } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import { adminMiddleware } from "~/server/admin-page.server";
import { requireAdmin } from "~/server/auth.server";
import { clockContext } from "~/server/clock.server";
import { OrderId } from "~/server/contracts/admin";
import { requestDbContext } from "~/server/db.server";
import { invoiceDocument } from "~/server/services/invoice.server";
import type { Route } from "./+types/order-invoice";

/**
 * `admin/order-invoice` (`/admin/orders/:id/invoice`, S-127): the printable invoice, the fallback
 * when the phone cannot make the PDF. Same document and numbering as `invoice.json` (any admin;
 * `private, no-store`, noindex). Outside the admin frame so it prints as the bare page.
 */
export const middleware: Route.MiddlewareFunction[] = adminMiddleware;

export async function loader(args: Route.LoaderArgs) {
  const me = await requireAdmin(args);
  const id = OrderId.safeParse(args.params.id);
  if (!id.success) throw data(null, { status: 404 });
  const invoice = await invoiceDocument(args.context.get(requestDbContext).db, id.data, args.context.get(clockContext).now());
  if (!invoice) throw data(null, { status: 404 });
  return { title: translate("admin.invoice.metaTitle", me.locale, { number: invoice.number }), invoice, orderUrl: `/admin/orders/${id.data}` };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

export const ErrorBoundary = AdminErrorBoundary;

export default function OrderInvoice({ loaderData }: Route.ComponentProps) {
  const { t } = useI18n();
  return (
    <div className="min-h-dvh bg-muted px-4 py-4 print:bg-white print:p-0">
      <nav aria-label={t("admin.invoice.title")} className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-2 print:hidden">
        <a href={loaderData.orderUrl} className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 font-semibold link">
          <ChevronLeft aria-hidden="true" className="size-5" />
          {t("admin.invoice.back")}
        </a>
        <Button type="button" onClick={() => window.print()} className="min-h-11">
          <Printer aria-hidden="true" />
          {t("admin.invoice.print")}
        </Button>
      </nav>
      <main id="main">
        <InvoiceSheet doc={loaderData.invoice} />
      </main>
    </div>
  );
}
