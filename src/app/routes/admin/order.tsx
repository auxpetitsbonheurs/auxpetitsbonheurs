import { useEffect, useRef, useState } from "react";
import { Form, data, isRouteErrorResponse, useNavigation } from "react-router";
import { NotFoundContent } from "~/components/shell/not-found-content";
import { StatusBadge } from "~/components/order/status-badge";
import { Alert } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { SubmitButton } from "~/components/ui/submit-button";
import { TextField } from "~/components/ui/text-field";
import { formatOrderNumber } from "~/domain/order-number";
import { DECLINE_REASON_MAX, paymentDeadline, timeLeft } from "~/domain/payment";
import { allowedActions } from "~/domain/status";
import { formatDayLabel, formatLogTime } from "~/domain/time";
import { t as translate } from "~/i18n/catalog.server";
import { localized } from "~/i18n/localized";
import { useI18n } from "~/i18n/react";
import { type Locale, formatRupees } from "~/lib/locale";
import { actionError } from "~/server/action-result.server";
import { requireAdmin } from "~/server/auth.server";
import { type OrderAction, OrderActionInput, OrderId } from "~/server/contracts/admin";
import { clockContext } from "~/server/clock.server";
import { type Database, requestDbContext } from "~/server/db.server";
import { type AdminOrder, findAdminOrder } from "~/server/repos/admin-orders.server";
import { type OrderEventView, listOrderEvents } from "~/server/repos/order-events.server";
import { getSiteSettings } from "~/server/repos/settings.server";
import { approveOrder } from "~/server/services/approve-order.server";
import { declineOrder, markPaid, markRefunded, undoPaid } from "~/server/services/order-payment.server";
import type { Route } from "./+types/order";

const LOGGED_TYPES = new Set(["created", "approved", "payment_received", "payment_undone", "payment_reminder_sent", "declined", "refunded", "cancelled"]);

/** One log line in the admin's language: "Approved by Sarah, 12 Nov 14:05" (Mauritius time, FR-045). */
function eventLine(event: OrderEventView, locale: Locale): string {
  const actor = event.actor.name ?? translate(`admin.log.actor.${event.actor.type}`, locale);
  const key = LOGGED_TYPES.has(event.type) ? event.type : "other";
  return translate(`admin.log.event.${key}`, locale, { actor, time: formatLogTime(new Date(event.at), locale) });
}

const mapsSearch = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

/** "12 h left" / "45 min left" / "Cancelling soon". */
function timeLeftText(createdAt: Date, now: Date, locale: Locale): string {
  const left = timeLeft(createdAt, now);
  if (left.kind === "overdue") return translate("admin.orders.payment.overdue", locale);
  return translate(left.kind === "hours" ? "admin.orders.payment.hoursLeft" : "admin.orders.payment.minutesLeft", locale, { count: left.value });
}

/** The Payment section's facts (S-279, S-281), in the admin's language. */
function paymentFacts(order: AdminOrder, now: Date, locale: Locale) {
  const deadline = paymentDeadline(order.createdAt);
  return {
    awaiting: order.status === "awaiting_payment",
    deadlineLabel: `${formatLogTime(deadline, locale)}`,
    timeLeft: timeLeftText(order.createdAt, now, locale),
    paidLabel: order.paid && order.paidAt ? formatLogTime(order.paidAt, locale) : null,
    refund: order.refundDueRs === null ? null : { amountRs: order.refundDueRs, refundedLabel: order.refundedAt ? formatLogTime(order.refundedAt, locale) : null },
    cancelledUnpaid: order.status === "cancelled" && order.cancelReason === "unpaid",
    declineReason: order.declineReason,
  };
}

/** Names the page in the admin header (S-033 AC6). */
export const handle = { titleKey: "admin.nav.orders" };

/**
 * `admin/order` loader: the full order, customer contact, Call and Maps links, the Juice
 * payment facts and `allowed` (approve, markPaid, decline, markRefunded). WhatsApp, notes,
 * photos and the other actions are E-06.
 */
export async function loader(args: Route.LoaderArgs) {
  const me = await requireAdmin(args);
  const id = OrderId.safeParse(args.params.id);
  if (!id.success) throw data(null, { status: 404 });
  const db = args.context.get(requestDbContext).db;
  const order = await findAdminOrder(db, id.data);
  if (!order) throw data(null, { status: 404 });
  // The prefix stored at placement (S-058 AC6); the Settings one only for a row without it.
  const number = formatOrderNumber(order.numberPrefix ?? (await getSiteSettings(db)).checkout.orderNumberPrefix, order.number);
  const { contactName, contactPhone, contactEmail, createdAt, paidAt: _paidAt, refundedAt, numberPrefix: _prefix, ...rest } = order;
  const now = args.context.get(clockContext).now();
  return {
    title: translate("admin.order.metaTitle", me.locale, { number }),
    order: { ...rest, number, dateLabel: formatDayLabel(order.fulfilOn, me.locale), placedAt: formatLogTime(createdAt, me.locale) },
    customer: { name: contactName, phone: contactPhone, email: contactEmail },
    telUrl: `tel:${contactPhone}`,
    mapsUrl: order.fulfilment === "delivery" && order.address ? mapsSearch(order.address) : null,
    payment: paymentFacts(order, now, me.locale),
    allowed: allowedActions(order.status, { refundPending: order.refundDueRs !== null && refundedAt === null }),
    events: (await listOrderEvents(db, order.id)).map((event) => ({ ...event, text: eventLine(event, me.locale) })),
  };
}

function runAction(db: Database, action: OrderAction, base: { orderId: string; adminId: string; now: Date }) {
  const input = { ...base, version: action.version };
  switch (action.intent) {
    case "approve":
      return approveOrder(db, input);
    case "markPaid":
      return markPaid(db, input);
    case "undoPaid":
      return undoPaid(db, input);
    case "decline":
      return declineOrder(db, { ...input, reason: action.reason });
    case "markRefunded":
      return markRefunded(db, input);
  }
}

/**
 * `admin/order` actions: `approve` (FR-052), `markPaid`, `undoPaid`, `decline`, `markRefunded`
 * (juice-payment spec), each `{ version }` (decline adds `reason?`) -> `{ ok, intent, order: { status, version } }`,
 * or NOT_FOUND / ORDER_CHANGED / INVALID_TRANSITION / VALIDATION_FAILED.
 */
export async function action(args: Route.ActionArgs) {
  const me = await requireAdmin(args);
  const id = OrderId.safeParse(args.params.id);
  if (!id.success) return actionError("NOT_FOUND", me.locale);
  const input = OrderActionInput.safeParse(Object.fromEntries(await args.request.formData()));
  if (!input.success) return actionError("VALIDATION_FAILED", me.locale);
  const result = await runAction(args.context.get(requestDbContext).db, input.data, { orderId: id.data, adminId: me.id, now: args.context.get(clockContext).now() });
  if (!result.ok) return actionError(result.code, me.locale);
  return { ok: true as const, intent: input.data.intent, order: result.order };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

type LoaderData = Route.ComponentProps["loaderData"];

const linkClass = "inline-flex min-h-11 items-center font-semibold link wrap-anywhere";
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
      <h2 id={id} className="text-h2">
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

/** Juice payment state (S-279, S-281): awaiting with the deadline, paid, refund due or sent. */
function PaymentSection({ data: { order, payment } }: { data: LoaderData }) {
  const { t } = useI18n();
  const amount = formatRupees(order.totalRs);
  return (
    <Section id="payment-heading" title={t("admin.order.paymentTitle")}>
      <div className="mt-3 grid gap-1">
        {payment.awaiting ? (
          <>
            <p className="font-semibold">{t("admin.order.paymentAwaiting", { reference: order.number })}</p>
            <p>{t("admin.order.paymentDeadline", { time: payment.deadlineLabel, left: payment.timeLeft })}</p>
          </>
        ) : payment.paidLabel ? (
          <p className="font-semibold">{t("admin.order.paymentPaid", { amount, time: payment.paidLabel })}</p>
        ) : (
          <p>{payment.cancelledUnpaid ? t("admin.payment.cancelledUnpaid") : t("admin.order.paymentUnpaid")}</p>
        )}
        {payment.declineReason && <p className="wrap-anywhere">{t("admin.order.declineReasonShown", { reason: payment.declineReason })}</p>}
        {payment.refund?.refundedLabel && <p className="font-semibold">{t("admin.order.refundedAt", { amount: formatRupees(payment.refund.amountRs), time: payment.refund.refundedLabel })}</p>}
      </div>
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
      <div className="mt-3 grid gap-2 rounded-lg bg-muted p-5">
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

interface ActionResult {
  ok: boolean;
  intent?: OrderAction["intent"];
  order?: { status: string; version: number };
  error?: { code: string; message: string };
}

type Step = "idle" | "confirmPaid" | "decline" | "confirmRefund";

/** The submitted intent while it is on its way (the button shows its busy state at once). */
function usePendingIntent(): string | null {
  const navigation = useNavigation();
  return navigation.state !== "idle" ? String(navigation.formData?.get("intent") ?? "") : null;
}

/** The outcome of the last action, said once in the polite region; Undo after Payment received (S-279 AC3). */
function ResultLine({ number, result, pending }: { number: string; result: ActionResult | undefined; pending: string | null }) {
  const { t } = useI18n();
  const ref = useRef<HTMLParagraphElement>(null);
  const messages: Record<string, string> = {
    approve: t("admin.order.approved", { number }),
    markPaid: t("admin.order.markedPaid", { number }),
    undoPaid: t("admin.order.undone", { number }),
    decline: t("admin.order.declined", { number }),
    markRefunded: t("admin.order.refundedDone"),
  };
  const success = result?.ok && result.intent ? messages[result.intent]! : "";
  useEffect(() => {
    if (success) ref.current?.focus();
  }, [success, result]);
  return (
    <div className={success ? "flex flex-wrap items-center gap-3 px-1 pb-2" : undefined}>
      <p ref={ref} role="status" tabIndex={-1} data-testid="approve-result" className={success ? "font-semibold outline-offset-2" : "sr-only"}>
        {success}
      </p>
      {result?.ok && result.intent === "markPaid" && result.order && (
        <Form method="post">
          <input type="hidden" name="version" value={result.order.version} />
          <SubmitButton name="intent" value="undoPaid" variant="outline" size="sm" pending={pending === "undoPaid"} pendingText={t("admin.order.undoing")} aria-label={t("admin.order.undoLabel", { number })}>
            {t("admin.order.undo")}
          </SubmitButton>
        </Form>
      )}
    </div>
  );
}

function ConfirmPaid({ data: { order }, pending, onBack }: { data: LoaderData; pending: string | null; onBack: () => void }) {
  const { t } = useI18n();
  const amount = formatRupees(order.totalRs);
  return (
    <Form method="post" aria-labelledby="confirm-paid" className="grid gap-3 px-1">
      <input type="hidden" name="version" value={order.version} />
      <p id="confirm-paid" className="text-lg font-semibold">
        {t("admin.order.markPaidConfirm", { amount, number: order.number })}
      </p>
      <p className="text-sm">{t("admin.order.markPaidHint", { amount, number: order.number })}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <SubmitButton name="intent" value="markPaid" pending={pending === "markPaid"} pendingText={t("admin.order.markingPaid")} size="lg" autoFocus>
          {t("admin.order.markPaidYes")}
        </SubmitButton>
        <Button type="button" variant="outline" size="lg" onClick={onBack}>
          {t("admin.order.cancelStep")}
        </Button>
      </div>
    </Form>
  );
}

function DeclineForm({ data: { order }, pending, onBack }: { data: LoaderData; pending: string | null; onBack: () => void }) {
  const { t } = useI18n();
  return (
    <Form method="post" aria-labelledby="decline-title" className="grid gap-3 px-1">
      <input type="hidden" name="version" value={order.version} />
      <p id="decline-title" className="text-lg font-semibold">
        {t("admin.order.declineTitle", { number: order.number })}
      </p>
      {order.paid && <p className="font-semibold">{t("admin.order.declinePaidNote", { amount: formatRupees(order.totalRs) })}</p>}
      <TextField id="decline-reason" name="reason" label={t("admin.order.declineReason")} hint={t("admin.order.declineHint")} multiline rows={2} maxLength={DECLINE_REASON_MAX} autoComplete="off" autoFocus />
      <div className="grid gap-2 sm:grid-cols-2">
        <SubmitButton name="intent" value="decline" variant="destructive" pending={pending === "decline"} pendingText={t("admin.order.declining")} size="lg">
          {t("admin.order.declineYes", { number: order.number })}
        </SubmitButton>
        <Button type="button" variant="outline" size="lg" onClick={onBack}>
          {t("admin.order.cancelStep")}
        </Button>
      </div>
    </Form>
  );
}

function RefundStep({ data: { order, payment, customer }, step, setStep, pending }: { data: LoaderData; step: Step; setStep: (step: Step) => void; pending: string | null }) {
  const { t } = useI18n();
  const amount = formatRupees(payment.refund?.amountRs ?? 0);
  return (
    <div className="grid gap-2 px-1" data-testid="refund-step">
      <p className="text-lg font-semibold">{t("admin.order.refundTitle", { amount })}</p>
      <p className="text-sm wrap-anywhere">{t("admin.order.refundBody", { phone: customer.phone })}</p>
      {step === "confirmRefund" ? (
        <Form method="post" aria-label={t("admin.order.markRefundedConfirm", { amount })} className="grid gap-2">
          <input type="hidden" name="version" value={order.version} />
          <p className="font-semibold">{t("admin.order.markRefundedConfirm", { amount })}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <SubmitButton name="intent" value="markRefunded" pending={pending === "markRefunded"} pendingText={t("admin.order.markingRefunded")} size="lg" autoFocus>
              {t("admin.order.markRefundedYes")}
            </SubmitButton>
            <Button type="button" variant="outline" size="lg" onClick={() => setStep("idle")}>
              {t("admin.order.cancelStep")}
            </Button>
          </div>
        </Form>
      ) : (
        <Button type="button" size="lg" className="w-full" onClick={() => setStep("confirmRefund")}>
          {t("admin.order.markRefunded")}
        </Button>
      )}
    </div>
  );
}

function MainActions({ data, setStep, pending }: { data: LoaderData; setStep: (step: Step) => void; pending: string | null }) {
  const { t } = useI18n();
  const { order, allowed } = data;
  return (
    <div className="grid gap-2 px-1">
      {allowed.approve && (
        <Form method="post" aria-label={t("admin.order.actionsLabel")}>
          <input type="hidden" name="version" value={order.version} />
          <SubmitButton name="intent" value="approve" pending={pending === "approve"} pendingText={t("admin.order.approving")} size="lg" className="w-full">
            {t("admin.order.approve")}
          </SubmitButton>
        </Form>
      )}
      {allowed.markPaid && (
        <Button type="button" size="lg" className="w-full" onClick={() => setStep("confirmPaid")}>
          {t("admin.order.markPaid")}
        </Button>
      )}
      {allowed.decline && (
        <Button type="button" variant="outline" size="lg" className="w-full" onClick={() => setStep("decline")}>
          {t("admin.order.decline")}
        </Button>
      )}
    </div>
  );
}

/**
 * Sticky bar at the bottom (one thumb). Payment received and Refunded ask to confirm with the
 * amount first; Refuse opens its reason. The result is said in a polite live region that is
 * always rendered (sr-only while empty); focus moves to it, since the button that was pressed
 * disappears. After Payment received the result offers Undo.
 */
function ActionBar({ data, result }: { data: LoaderData; result: ActionResult | undefined }) {
  const { t } = useI18n();
  const pending = usePendingIntent();
  // A new answer or a new version closes any open step: the step belongs to the state it was opened in.
  const resetKey = `${data.order.version}:${result ? (result.ok ? result.intent : result.error?.code) : ""}`;
  const [opened, setOpened] = useState<{ key: string; step: Step }>({ key: resetKey, step: "idle" });
  const step = opened.key === resetKey ? opened.step : "idle";
  const setStep = (next: Step) => setOpened({ key: resetKey, step: next });
  const { allowed } = data;
  const anything = allowed.approve || allowed.markPaid || allowed.decline || allowed.markRefunded;
  const back = () => setStep("idle");
  return (
    <div data-sticky-bar className="sticky bottom-0 z-10 mt-8 border-t bg-card py-3 shadow-md">
      <ResultLine number={data.order.number} result={result} pending={pending} />
      {allowed.markRefunded ? (
        <RefundStep data={data} step={step} setStep={setStep} pending={pending} />
      ) : step === "confirmPaid" && allowed.markPaid ? (
        <ConfirmPaid data={data} pending={pending} onBack={back} />
      ) : step === "decline" && allowed.decline ? (
        <DeclineForm data={data} pending={pending} onBack={back} />
      ) : anything ? (
        <MainActions data={data} setStep={setStep} pending={pending} />
      ) : (
        !result?.ok && <p className="px-1">{t("admin.order.noActions")}</p>
      )}
    </div>
  );
}

function Conflict({ result, reloadHref }: { result: ActionResult | undefined; reloadHref: string }) {
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
  const result = actionData as ActionResult | undefined;
  const toPayment = order.status === "awaiting_payment" || loaderData.allowed.markRefunded;
  const back = toPayment ? "/admin/orders?tab=payment" : "/admin/orders?tab=review";
  return (
    <>
      <p>
        <a href={back} className={linkClass}>
          {toPayment ? t("admin.order.backPayment") : t("admin.order.back")}
        </a>
      </p>
      <h1 className="mt-2">{t("admin.order.title", { number: order.number })}</h1>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="sr-only">{t("admin.order.status")}:</span>
        <StatusBadge status={order.status} />
        {loaderData.payment.cancelledUnpaid && <span className="text-sm font-semibold">{t("admin.payment.cancelledUnpaid")}</span>}
        <span className="text-sm">{t(`admin.orders.sourceName.${order.source}`)}</span>
        <span className="text-sm">{t("admin.order.placedAt", { time: order.placedAt })}</span>
      </div>
      <Conflict result={result} reloadHref={`/admin/orders/${order.id}`} />
      <PaymentSection data={loaderData} />
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
