import { data, isRouteErrorResponse } from "react-router";
import { OrderActionBar } from "~/components/admin/order/action-bar";
import { ActivityLog } from "~/components/admin/order/activity-log";
import { OrderConflict } from "~/components/admin/order/conflict";
import { OrderHeader } from "~/components/admin/order/header";
import { PaymentSection } from "~/components/admin/order/payment-section";
import { PrivateNote } from "~/components/admin/order/private-note";
import { CustomerSection, FulfilmentSection, ItemsSection, ReasonSection, RequestSection } from "~/components/admin/order/sections";
import { QuoteSheet, type QuoteResult, RequestPhotos } from "~/components/admin/request-panel";
import { NotFoundContent } from "~/components/shell/not-found-content";
import { adminAllowed } from "~/domain/order-transitions";
import { formatOrderNumber } from "~/domain/order-number";
import { formatDayLabel, formatLogTime, todayMU } from "~/domain/time";
import { t as translate } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import { actionError } from "~/server/action-result.server";
import { cancelReason, contactLinks, eventLine, paymentFacts } from "~/server/admin-order-view.server";
import { requireAdmin } from "~/server/auth.server";
import { OrderActionInput, OrderId } from "~/server/contracts/admin";
import { clockContext } from "~/server/clock.server";
import { requestDbContext } from "~/server/db.server";
import { findAdminOrder } from "~/server/repos/admin-orders.server";
import { listOrderEvents } from "~/server/repos/order-events.server";
import { getSiteSettings } from "~/server/repos/settings.server";
import { SendQuoteInput } from "~/server/contracts/custom-request";
import { publicConfigContext } from "~/server/public-config.server";
import { adminRequestView } from "~/server/services/admin-request.server";
import { sendQuote } from "~/server/services/quotes.server";
import { requestPhotosContext } from "~/server/storage.server";
import type { Locale } from "~/lib/locale";
import { runOrderAction } from "~/server/services/order-action.server";
import type { Route } from "./+types/order";

/** Names the page in the admin header (S-033 AC6). */
export const handle = { titleKey: "admin.nav.orders" };

/**
 * `admin/order` loader (contracts.md, S-113): the full order with its custom-request fields,
 * customer contact links, the Juice payment facts (S-279, S-281), the private note, the activity
 * log and `allowed` from the transition table (S-115 AC5).
 */
export async function loader(args: Route.LoaderArgs) {
  const me = await requireAdmin(args);
  const id = OrderId.safeParse(args.params.id);
  if (!id.success) throw data(null, { status: 404 });
  const db = args.context.get(requestDbContext).db;
  const [order, events] = await Promise.all([findAdminOrder(db, id.data), listOrderEvents(db, id.data)]);
  if (!order) throw data(null, { status: 404 });
  // The prefix stored at placement (S-058 AC6); the Settings one only for a row without it.
  const number = formatOrderNumber(order.numberPrefix ?? (await getSiteSettings(db)).checkout.orderNumberPrefix, order.number);
  const { contactName, contactPhone, contactEmail, createdAt, paymentFrom: _paymentFrom, paidAt: _paidAt, refundedAt, numberPrefix: _prefix, adminNote, ...rest } = order;
  const quoteExpiresOn = order.customRequest?.quoteExpiresOn;
  const now = args.context.get(clockContext).now();
  const today = todayMU(now);
  // A custom request (E-08 S-155, S-156): its photos as 10-minute signed URLs and the quote sheet's defaults.
  const request = order.source === "custom_request"
    ? await adminRequestView(db, order.id, { photos: args.context.get(requestPhotosContext), supabaseUrl: args.context.get(publicConfigContext).supabaseUrl, today, quoteValidityDays: (await getSiteSettings(db)).quoteValidityDays })
    : null;
  return {
    request,
    today,
    title: translate("admin.order.metaTitle", me.locale, { number }),
    order: {
      ...rest,
      number,
      dateLabel: formatDayLabel(order.fulfilOn, me.locale),
      placedAt: formatLogTime(createdAt, me.locale),
      quoteExpiresLabel: quoteExpiresOn ? formatDayLabel(quoteExpiresOn, me.locale) : null,
      reason: cancelReason(order.status, events),
    },
    customer: { name: contactName, phone: contactPhone, email: contactEmail },
    ...contactLinks({ ...order, number }),
    payment: paymentFacts(order, now, me.locale),
    adminNote: adminNote ?? "",
    allowed: adminAllowed(order.status, order.fulfilment, { refundPending: order.refundDueRs !== null && refundedAt === null }),
    events: events.map((event) => eventLine(event, me.locale)),
  };
}

/** VALIDATION_FAILED `fields` for the two free-text inputs, so the dialog or note shows the reason. */
function fieldMessage(field: unknown, locale: "en" | "fr"): Record<string, string> | undefined {
  if (field === "reason") return { reason: translate("admin.order.reasonTooLong", locale) };
  if (field === "adminNote") return { adminNote: translate("admin.order.noteTooLong", locale, { max: 2000 }) };
  return undefined;
}

/**
 * `admin/order` actions (FR-052, FR-054; juice-payment spec): approve, markPaid, undoPaid,
 * decline, markRefunded, advance, revert, cancel and setPaid carry `version` and answer
 * `{ ok, intent, order: { status, version } }`; saveNote answers `{ ok, intent }`. Refusals:
 * ORDER_CHANGED, INVALID_TRANSITION, VALIDATION_FAILED, NOT_FOUND, each with `intent`.
 */
const QUOTE_FIELDS = ["amountRs", "note", "expiresOn"] as const;

/** `sendQuote` (E-08 S-156, S-161): `{ version, amountRs 1..1_000_000, note? ≤ 1000, expiresOn ≥ today }`, field errors inline. */
async function sendQuoteAction(form: Record<string, FormDataEntryValue>, args: Route.ActionArgs, me: { id: string; locale: Locale }, orderId: string) {
  const now = args.context.get(clockContext).now();
  const parsed = SendQuoteInput.safeParse(form);
  const bad = new Set<string>(parsed.success ? [] : parsed.error.issues.map((issue) => String(issue.path[0])));
  const expiry = typeof form.expiresOn === "string" ? form.expiresOn : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(expiry) && expiry < todayMU(now)) bad.add("expiresOn");
  const values = Object.fromEntries(QUOTE_FIELDS.map((f) => [f, typeof form[f] === "string" ? (form[f] as string) : ""]));
  if (!parsed.success || bad.size > 0) {
    const fields = Object.fromEntries([...bad].filter((f) => (QUOTE_FIELDS as readonly string[]).includes(f)).map((f) => [f, translate(`admin.request.errors.${f}`, me.locale)]));
    return actionError("VALIDATION_FAILED", me.locale, { fields, extra: { intent: "sendQuote", values } });
  }
  const { version, amountRs, note, expiresOn } = parsed.data;
  const result = await sendQuote(args.context.get(requestDbContext).db, { orderId, version, adminId: me.id, amountRs, note: note ? note : null, expiresOn, now });
  if (!result.ok) return actionError(result.code, me.locale, { extra: { intent: "sendQuote", values } });
  return { ok: true as const, intent: "sendQuote" as const, order: result.order };
}

export async function action(args: Route.ActionArgs) {
  const me = await requireAdmin(args);
  const id = OrderId.safeParse(args.params.id);
  if (!id.success) return actionError("NOT_FOUND", me.locale);
  const form = Object.fromEntries(await args.request.formData());
  if (form.intent === "sendQuote") return sendQuoteAction(form, args, me, id.data);
  const intent = typeof form.intent === "string" ? form.intent : null;
  const input = OrderActionInput.safeParse(form);
  if (!input.success) {
    return actionError("VALIDATION_FAILED", me.locale, { fields: fieldMessage(input.error.issues[0]?.path[0], me.locale), extra: { intent } });
  }
  const db = args.context.get(requestDbContext).db;
  const result = await runOrderAction(db, input.data, { orderId: id.data, adminId: me.id, now: args.context.get(clockContext).now() });
  if (!result.ok) return actionError(result.code, me.locale, { extra: { intent } });
  return "order" in result ? { ok: true as const, intent: input.data.intent, order: result.order } : { ok: true as const, intent: input.data.intent };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

export type OrderLoaderData = Route.ComponentProps["loaderData"];

export default function AdminOrder({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <>
      <OrderHeader data={loaderData} />
      <OrderConflict data={loaderData} actionData={actionData} />
      <PaymentSection data={loaderData} />
      <CustomerSection data={loaderData} />
      <FulfilmentSection data={loaderData} />
      {/* A custom request has no items: its price is the quote in the request section (E-08). */}
      {!loaderData.request && <ItemsSection data={loaderData} />}
      <RequestSection data={loaderData} />
      {loaderData.request && <RequestPhotos photos={loaderData.request.photos} />}
      {loaderData.request && loaderData.allowed.sendQuote && (
        <QuoteSheet request={loaderData.request} version={loaderData.order.version} fulfilOn={loaderData.order.fulfilOn} today={loaderData.today} result={actionData as QuoteResult | undefined} pending={false} />
      )}
      <ReasonSection data={loaderData} />
      <PrivateNote orderId={loaderData.order.id} initial={loaderData.adminNote} />
      <ActivityLog events={loaderData.events} />
      <OrderActionBar data={loaderData} actionData={actionData} />
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
