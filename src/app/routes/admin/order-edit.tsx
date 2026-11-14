import { useState } from "react";
import { data, isRouteErrorResponse, redirect, useFetcher } from "react-router";
import { OrderForm } from "~/components/admin/order-form/order-form";
import type { FormLine, OrderFormState } from "~/components/admin/order-form/model";
import { formPayload } from "~/components/admin/order-form/model";
import { orderLinkClass } from "~/components/admin/order/header";
import { NotFoundContent } from "~/components/shell/not-found-content";
import { Alert } from "~/components/ui/alert";
import { eq, asc } from "drizzle-orm";
import { orderItem, orders } from "~/db/schema";
import { formatOrderNumber } from "~/domain/order-number";
import { t as translate } from "~/i18n/catalog.server";
import { localized } from "~/i18n/localized";
import { useI18n } from "~/i18n/react";
import type { Locale } from "~/lib/locale";
import { actionError } from "~/server/action-result.server";
import { requireAdmin } from "~/server/auth.server";
import { clockContext } from "~/server/clock.server";
import { OrderId } from "~/server/contracts/admin";
import { OrderEditInput, problemField } from "~/server/contracts/order-edit";
import { type Database, requestDbContext } from "~/server/db.server";
import { loadMenu } from "~/server/menu.server";
import { orderOptionLabels } from "~/server/order-options.server";
import { publicConfigContext } from "~/server/public-config.server";
import { getSiteSettings } from "~/server/repos/settings.server";
import { editOrder } from "~/server/services/edit-order.server";
import type { Route } from "./+types/order-edit";

/** Names the page in the admin header (S-033 AC6). */
export const handle = { titleKey: "admin.nav.orders" };

const NOT_EDITABLE = new Set(["completed", "declined", "cancelled", "closed"]);

async function readOrder(db: Database, id: string, locale: Locale) {
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return null;
  const items = await db.select().from(orderItem).where(eq(orderItem.orderId, id)).orderBy(asc(orderItem.sortOrder));
  const lines: FormLine[] = items.map((item) => ({
    key: item.id,
    kind: "kept",
    itemId: item.id,
    name: { en: item.nameEn, fr: item.nameFr },
    unitRs: item.lineTotalRs / item.quantity,
    quantity: item.quantity,
    details: [...orderOptionLabels(item.options).map((o) => localized(o.label, locale)), ...(item.cakeMessage ? [`“${item.cakeMessage}”`] : [])],
  }));
  return { order, lines };
}

/**
 * `admin/order-edit` loader (contracts.md, S-122 AC1, AC6): the order prefilled as form state, the
 * menu (the same pricing as the server), the windows, and `editable` (false once completed or
 * stopped: the page then explains instead of offering the form).
 */
export async function loader(args: Route.LoaderArgs) {
  const me = await requireAdmin(args);
  const id = OrderId.safeParse(args.params.id);
  if (!id.success) throw data(null, { status: 404 });
  const db = args.context.get(requestDbContext).db;
  const read = await readOrder(db, id.data, me.locale);
  if (!read) throw data(null, { status: 404 });
  const { order, lines } = read;
  const clock = args.context.get(clockContext);
  const [settings, menu] = await Promise.all([getSiteSettings(db), loadMenu({ db, supabaseUrl: args.context.get(publicConfigContext).supabaseUrl, now: clock.now(), fixedClock: clock.fixed })]);
  const number = formatOrderNumber(order.numberPrefix ?? settings.checkout.orderNumberPrefix, order.number);
  const state: OrderFormState = {
    lines,
    fulfilment: { fulfilment: order.fulfilment, date: order.fulfilOn, windowId: order.timeWindow.id, address: order.address ?? "", landmark: order.landmark ?? "", deliveryFeeRs: order.deliveryFeeRs || settings.checkout.deliveryFeeRs },
    contact: { name: order.contactName, phone: order.contactPhone, email: order.contactEmail ?? "", note: order.customerNote ?? "" },
    overrideTotalRs: order.totalOverridden ? order.totalRs : null,
  };
  return {
    title: translate("admin.orderEdit.metaTitle", me.locale, { number }),
    id: order.id,
    number,
    version: order.version,
    editable: !NOT_EDITABLE.has(order.status),
    state,
    menu: menu.data,
    windows: settings.checkout.windows,
    nowMs: clock.now().getTime(),
  };
}

function fieldErrors(issues: { path: PropertyKey[] }[], locale: Locale): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const field = problemField(issue.path);
    fields[field] ??= translate(`admin.orderForm.problem.${field}`, locale);
  }
  return fields;
}

/**
 * `admin/order-edit` save (FR-053, S-122, S-123): `{ payload: JSON }` → redirect to the order with
 * `?updated=1&emailed=0|1&warnings=…`, or ORDER_CHANGED / INVALID_TRANSITION / PRODUCT_UNAVAILABLE /
 * VALIDATION_FAILED with `fields`.
 */
export async function action(args: Route.ActionArgs) {
  const me = await requireAdmin(args);
  const id = OrderId.safeParse(args.params.id);
  if (!id.success) return actionError("NOT_FOUND", me.locale);
  const form = await args.request.formData();
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("payload") ?? ""));
  } catch {
    return actionError("VALIDATION_FAILED", me.locale, { fields: { form: translate("admin.orderForm.problem.form", me.locale) } });
  }
  const input = OrderEditInput.safeParse(raw);
  if (!input.success) return actionError("VALIDATION_FAILED", me.locale, { fields: fieldErrors(input.error.issues, me.locale) });
  const db = args.context.get(requestDbContext).db;
  const clock = args.context.get(clockContext);
  const now = clock.now();
  const [settings, menu] = await Promise.all([getSiteSettings(db), loadMenu({ db, supabaseUrl: args.context.get(publicConfigContext).supabaseUrl, now, fixedClock: clock.fixed })]);
  const result = await editOrder(db, { orderId: id.data, adminId: me.id, now, input: input.data, menu: menu.data, windows: settings.checkout.windows, availability: settings.availability });
  if (result.ok) {
    const query = new URLSearchParams({ updated: "1", emailed: result.emailed ? "1" : "0" });
    if (result.warnings.length > 0) query.set("warnings", result.warnings.join(","));
    throw redirect(`/admin/orders/${id.data}?${query.toString()}`);
  }
  if (result.code === "PRODUCT_UNAVAILABLE") return actionError("PRODUCT_UNAVAILABLE", me.locale, { extra: { names: result.names } });
  if (result.code === "VALIDATION_FAILED") return actionError("VALIDATION_FAILED", me.locale, { fields: fieldErrors(Object.keys(result.fields).map((f) => ({ path: f.split(".") })), me.locale) });
  return actionError(result.code, me.locale);
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

type Answer = { ok: false; error: { code: string; message: string; fields?: Record<string, string> }; names?: string[] };

function EditForm({ data: loaded }: { data: Route.ComponentProps["loaderData"] }) {
  const { t } = useI18n();
  const fetcher = useFetcher<Answer>();
  const [state, setState] = useState(loaded.state);
  const answer = fetcher.state === "idle" ? fetcher.data : undefined;
  const reload = answer?.error.code === "ORDER_CHANGED" || answer?.error.code === "INVALID_TRANSITION";
  const formError = answer?.error.code === "PRODUCT_UNAVAILABLE" ? t("admin.orderEdit.productUnavailable", { names: (answer.names ?? []).join(", ") }) : reload ? undefined : answer && !answer.error.fields ? answer.error.message : undefined;
  return (
    <>
      {reload && (
        <Alert tone="danger" role="alert" className="mt-6">
          <p className="font-semibold">{answer?.error.message}</p>
          <a href={`/admin/orders/${loaded.id}/edit`} className={orderLinkClass}>
            {t("admin.order.reload")}
          </a>
        </Alert>
      )}
      <OrderForm
        state={state}
        onChange={setState}
        menu={loaded.menu}
        windows={loaded.windows}
        errors={answer?.error.fields ?? {}}
        formError={formError}
        allowOverride
        submitLabel={t("admin.orderEdit.save")}
        pendingText={t("admin.orderEdit.saving")}
        pending={fetcher.state !== "idle"}
        nowMs={loaded.nowMs}
        onSubmit={() => fetcher.submit({ payload: JSON.stringify({ ...formPayload(state), version: loaded.version, overrideTotalRs: state.overrideTotalRs }) }, { method: "post" })}
      />
    </>
  );
}

export default function AdminOrderEdit({ loaderData }: Route.ComponentProps) {
  const { t } = useI18n();
  return (
    <>
      <p>
        <a href={`/admin/orders/${loaderData.id}`} className={orderLinkClass}>
          {t("admin.orderEdit.back")}
        </a>
      </p>
      <h1 className="mt-2">{t("admin.orderEdit.title", { number: loaderData.number })}</h1>
      {loaderData.editable ? (
        <EditForm data={loaderData} />
      ) : (
        <Alert tone="info" title={t("admin.orderEdit.unavailableTitle")} className="mt-6">
          <p>{t("admin.orderEdit.unavailableBody")}</p>
        </Alert>
      )}
    </>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const { t } = useI18n();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundContent />;
  return (
    <>
      <h1>{t("errors.genericTitle")}</h1>
      <p className="mt-4">{t("errors.genericBody")}</p>
    </>
  );
}
