import { useEffect, useRef } from "react";
import { Form, data, isRouteErrorResponse, useNavigation } from "react-router";
import { NotFoundContent } from "~/components/shell/not-found-content";
import { StatusBadge } from "~/components/order/status-badge";
import { Alert } from "~/components/ui/alert";
import { SubmitButton } from "~/components/ui/submit-button";
import { formatOrderNumber } from "~/domain/order-number";
import { allowedActions } from "~/domain/status";
import { formatDayLabel, formatLogTime } from "~/domain/time";
import { t as translate } from "~/i18n/catalog.server";
import { localized } from "~/i18n/localized";
import { useI18n } from "~/i18n/react";
import { type Locale, formatRupees } from "~/lib/locale";
import { actionError } from "~/server/action-result.server";
import { requireAdmin } from "~/server/auth.server";
import { ApproveInput, OrderId } from "~/server/contracts/admin";
import { clockContext } from "~/server/clock.server";
import { requestDbContext } from "~/server/db.server";
import { findAdminOrder } from "~/server/repos/admin-orders.server";
import { type OrderEventView, listOrderEvents } from "~/server/repos/order-events.server";
import { getCheckoutSettings } from "~/server/repos/settings.server";
import { approveOrder } from "~/server/services/approve-order.server";
import type { Route } from "./+types/order";

const LOGGED_TYPES = new Set(["created", "approved"]);

/** One log line in the admin's language: "Approved by Sarah, 12 Nov 14:05" (Mauritius time, FR-045). */
function eventLine(event: OrderEventView, locale: Locale): string {
  const actor = event.actor.name ?? translate(`admin.log.actor.${event.actor.type}`, locale);
  const key = LOGGED_TYPES.has(event.type) ? event.type : "other";
  return translate(`admin.log.event.${key}`, locale, { actor, time: formatLogTime(new Date(event.at), locale) });
}

const mapsSearch = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

/**
 * `admin/order` loader, minimal slice: the full order, customer contact, Call and Maps
 * links and `allowed` (approve only). WhatsApp, notes, photos and the other actions are E-06.
 */
export async function loader(args: Route.LoaderArgs) {
  const me = await requireAdmin(args);
  const id = OrderId.safeParse(args.params.id);
  if (!id.success) throw data(null, { status: 404 });
  const db = args.context.get(requestDbContext).db;
  const order = await findAdminOrder(db, id.data);
  if (!order) throw data(null, { status: 404 });
  const { orderNumberPrefix } = await getCheckoutSettings(db);
  const number = formatOrderNumber(orderNumberPrefix, order.number);
  const { contactName, contactPhone, contactEmail, createdAt, ...rest } = order;
  return {
    title: translate("admin.order.metaTitle", me.locale, { number }),
    order: { ...rest, number, dateLabel: formatDayLabel(order.fulfilOn, me.locale), placedAt: formatLogTime(createdAt, me.locale) },
    customer: { name: contactName, phone: contactPhone, email: contactEmail },
    telUrl: `tel:${contactPhone}`,
    mapsUrl: order.fulfilment === "delivery" && order.address ? mapsSearch(order.address) : null,
    allowed: allowedActions(order.status),
    events: (await listOrderEvents(db, order.id)).map((event) => ({ ...event, text: eventLine(event, me.locale) })),
  };
}

/** `admin/order` approve (FR-052): `{ version }` -> `{ ok, order: { status, version } }`, or ORDER_CHANGED / INVALID_TRANSITION. */
export async function action(args: Route.ActionArgs) {
  const me = await requireAdmin(args);
  const id = OrderId.safeParse(args.params.id);
  if (!id.success) return actionError("NOT_FOUND", me.locale);
  const input = ApproveInput.safeParse(Object.fromEntries(await args.request.formData()));
  if (!input.success) return actionError("VALIDATION_FAILED", me.locale);
  const result = await approveOrder(args.context.get(requestDbContext).db, {
    orderId: id.data,
    version: input.data.version,
    adminId: me.id,
    now: args.context.get(clockContext).now(),
  });
  if (!result.ok) return actionError(result.code, me.locale);
  return { ok: true as const, order: result.order };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

type LoaderData = Route.ComponentProps["loaderData"];

const linkClass = "inline-flex min-h-11 items-center font-semibold text-primary-strong underline underline-offset-4 wrap-anywhere";
const row = "flex flex-wrap justify-between gap-x-4";
const money = (amount: number) => <span className="whitespace-nowrap tabular-nums">{formatRupees(amount)}</span>;

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="font-semibold">{term}</dt>
      <dd className="min-w-0 wrap-anywhere">{children}</dd>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-8">
      <h2 id={id} className="text-2xl">
        {title}
      </h2>
      {children}
    </section>
  );
}

function CustomerSection({ data: { customer, telUrl, order } }: { data: LoaderData }) {
  const { t } = useI18n();
  return (
    <Section id="customer-heading" title={t("admin.order.customerTitle")}>
      <dl className="mt-3 grid gap-3">
        <Fact term={t("admin.orders.customer")}>{customer.name}</Fact>
        <Fact term={t("admin.order.phone")}>
          <a href={telUrl} className={linkClass}>
            {t("admin.order.call", { phone: customer.phone })}
          </a>
        </Fact>
        {customer.email && <Fact term={t("admin.order.email")}>{customer.email}</Fact>}
        <Fact term={t("admin.order.languageTerm")}>{t(`admin.order.language.${order.locale}`)}</Fact>
      </dl>
    </Section>
  );
}

function FulfilmentSection({ data: { order, mapsUrl } }: { data: LoaderData }) {
  const { t, locale } = useI18n();
  const windowText = t("checkout.windowLabel", { label: localized(order.window.label, locale), start: order.window.start, end: order.window.end });
  return (
    <Section id="fulfilment-heading" title={t("admin.order.fulfilmentTitle")}>
      <dl className="mt-3 grid gap-3">
        <Fact term={t("admin.order.fulfilmentTitle")}>{order.fulfilment === "delivery" ? t("admin.order.delivery") : t("admin.order.pickup")}</Fact>
        <Fact term={t("admin.order.date")}>{order.dateLabel}</Fact>
        <Fact term={t("admin.order.time")}>{windowText}</Fact>
        {order.address && (
          <Fact term={t("admin.order.address")}>
            <span className="block">{order.address}</span>
            {mapsUrl && (
              <a href={mapsUrl} className={linkClass} rel="noreferrer">
                {t("admin.order.openMaps")}
              </a>
            )}
          </Fact>
        )}
        {order.landmark && <Fact term={t("admin.order.landmark")}>{order.landmark}</Fact>}
      </dl>
    </Section>
  );
}

function ItemsSection({ data: { order } }: { data: LoaderData }) {
  const { t, locale } = useI18n();
  return (
    <Section id="items-heading" title={t("admin.order.itemsTitle")}>
      <div className="mt-3 grid gap-2 rounded-lg bg-muted p-4">
        <ul className="grid gap-2">
          {order.items.map((item, index) => (
            <li key={index}>
              <p className={row}>
                <span>{t("checkout.itemLine", { name: localized(item.name, locale), quantity: item.quantity })}</span>
                {money(item.lineTotalRs)}
              </p>
              <p className="text-sm">{t("admin.order.unitPrice", { price: formatRupees(item.unitPriceRs) })}</p>
              {item.options.length > 0 && <p className="text-sm">{item.options.map((o) => localized(o.label, locale)).join(", ")}</p>}
              {item.cakeMessage && <p className="text-sm">{t("admin.order.cakeMessage", { message: item.cakeMessage })}</p>}
            </li>
          ))}
        </ul>
        {order.fulfilment === "delivery" ? (
          <p className={row}>
            <span>{t("checkout.feeLine")}</span>
            {money(order.deliveryFeeRs)}
          </p>
        ) : (
          <p>{t("checkout.pickupFree")}</p>
        )}
        <p className={`${row} border-t border-input pt-2 text-lg font-semibold`}>
          <span>{t("checkout.total")}</span>
          {money(order.totalRs)}
        </p>
      </div>
      {order.customerNote && (
        <div className="mt-4">
          <h3 className="text-lg">{t("admin.order.customerNote")}</h3>
          <p className="mt-1 max-w-measure whitespace-pre-line wrap-anywhere">{order.customerNote}</p>
        </div>
      )}
    </Section>
  );
}

/** The activity log (FR-045): a labelled list, oldest first; every order has at least its created line. */
function ActivityLog({ events }: { events: LoaderData["events"] }) {
  const { t } = useI18n();
  return (
    <Section id="log-heading" title={t("admin.log.title")}>
      <ol aria-labelledby="log-heading" className="mt-3 grid gap-2 border-s-2 border-input ps-4">
        {events.map((event, index) => (
          <li key={index} className="wrap-anywhere">
            <time dateTime={event.at}>{event.text}</time>
          </li>
        ))}
      </ol>
    </Section>
  );
}

interface ApproveResult {
  ok: boolean;
  error?: { code: string; message: string };
}

/**
 * Sticky bar at the bottom (one thumb): Approve with its loading state, and the result in a
 * polite live region. The region is always rendered (sr-only while empty) so screen readers
 * already track it when the result arrives; on success the Approve button disappears, so focus
 * moves to the result instead of dropping to <body>.
 */
function ActionBar({ data: { order, allowed }, result }: { data: LoaderData; result: ApproveResult | undefined }) {
  const { t } = useI18n();
  const navigation = useNavigation();
  const pending = navigation.state !== "idle" && navigation.formData?.get("intent") === "approve";
  const success = result?.ok ? t("admin.order.approved", { number: order.number }) : "";
  const resultRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (success) resultRef.current?.focus();
  }, [success]);
  return (
    <div data-sticky-bar className="sticky bottom-0 z-10 mt-8 border-t bg-card py-3 shadow-md">
      <p ref={resultRef} role="status" tabIndex={-1} data-testid="approve-result" className={success ? "px-1 font-semibold outline-offset-2" : "sr-only"}>
        {success}
      </p>
      {allowed.approve ? (
        <Form method="post" aria-label={t("admin.order.actionsLabel")} className="px-1">
          <input type="hidden" name="version" value={order.version} />
          <SubmitButton name="intent" value="approve" pending={pending} pendingText={t("admin.order.approving")} size="lg" className="w-full">
            {t("admin.order.approve")}
          </SubmitButton>
        </Form>
      ) : (
        !success && <p className="px-1">{t("admin.order.noActions")}</p>
      )}
    </div>
  );
}

function Conflict({ result, reloadHref }: { result: ApproveResult | undefined; reloadHref: string }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const error = result && !result.ok ? result.error : undefined;
  useEffect(() => {
    if (error) ref.current?.focus();
  }, [error]);
  if (!error) return null;
  return (
    <Alert ref={ref} tone="danger" role="alert" tabIndex={-1} className="mt-6 outline-offset-2">
      <p className="font-semibold">{error.message}</p>
      <a href={reloadHref} className={linkClass}>
        {t("admin.order.reload")}
      </a>
    </Alert>
  );
}

export default function AdminOrder({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useI18n();
  const { order } = loaderData;
  const result = actionData as ApproveResult | undefined;
  return (
    <>
      <p>
        <a href="/admin/orders?tab=review" className={linkClass}>
          {t("admin.order.back")}
        </a>
      </p>
      <h1 className="mt-2">{t("admin.order.title", { number: order.number })}</h1>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="sr-only">{t("admin.order.status")}:</span>
        <StatusBadge status={order.status} />
        <span className="text-sm">{t(`admin.orders.sourceName.${order.source}`)}</span>
        <span className="text-sm">{t("admin.order.placedAt", { time: order.placedAt })}</span>
      </div>
      <Conflict result={result} reloadHref={`/admin/orders/${order.id}`} />
      <CustomerSection data={loaderData} />
      <FulfilmentSection data={loaderData} />
      <ItemsSection data={loaderData} />
      <ActivityLog events={loaderData.events} />
      <ActionBar data={loaderData} result={result} />
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
