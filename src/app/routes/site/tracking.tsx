import { MessageCircle } from "lucide-react";
import { useEffect, useRef } from "react";
import { type ShouldRevalidateFunctionArgs, data, isRouteErrorResponse, redirect } from "react-router";
import { CancelOrder, type CancelRefusal, CancelRefusalAlert } from "~/components/order/cancel-order";
import { OrderNotFound } from "~/components/order/order-not-found";
import { PaymentInstructions } from "~/components/order/payment-instructions";
import { QuotePanel, type QuoteRefusal } from "~/components/order/quote-panel";
import { StatusBadge } from "~/components/order/status-badge";
import { StatusProgress } from "~/components/order/status-progress";
import { Alert } from "~/components/ui/alert";
import { buttonVariants } from "~/components/ui/button";
import { formatOrderNumber } from "~/domain/order-number";
import { canCustomerCancel, customerProgress } from "~/domain/status";
import { normalizePhone } from "~/domain/phone";
import { formatDayLabel, formatLongDate, todayMU } from "~/domain/time";
import { canRespondToQuote, isQuoteExpired } from "~/domain/custom-request";
import { t as translate } from "~/i18n/catalog.server";
import { localized } from "~/i18n/localized";
import { useI18n } from "~/i18n/react";
import { type Locale, formatRupees, localeFromPathname, localePath } from "~/lib/locale";
import { whatsappHref } from "~/lib/contact";
import { actionError } from "~/server/action-result.server";
import { clientIp, rateLimitedResult } from "~/server/auth-rate-limit.server";
import { clockContext } from "~/server/clock.server";
import { Version } from "~/server/contracts/shared";
import { requestDbContext } from "~/server/db.server";
import { paymentView } from "~/server/payment-view.server";
import { RL_TRACK, type RateLimitSubject, consumeRateLimit, rateLimitBucketFor, rateLimitVerdict } from "~/server/rate-limit.server";
import { findTrackedOrder } from "~/server/repos/orders.server";
import { findQuote } from "~/server/repos/custom-requests.server";
import { acceptQuote, declineQuote } from "~/server/services/quotes.server";
import { alertAdmins } from "~/server/notify/admin-alerts.server";
import { cancelOrderByCustomer } from "~/server/services/cancel-order.server";
import { isTrackingToken, orderLanguageRedirect, tokenPageHeaders } from "~/server/token-page.server";
import { findOrderWorkshops } from "~/server/repos/workshops.server";
import type { Route } from "./+types/tracking";

/** no-store, noindex, no-referrer on every response of this route (NFR-004, threat-model G-07). */
export const middleware: Route.MiddlewareFunction[] = [tokenPageHeaders];

/** RL-track (S-094 AC4): page loads and the cancel action count per IP, whatever the token. */
const trackSubject = (request: Request): RateLimitSubject => ({ action: "site.track", parts: [clientIp(request)] });

/** 429 with Retry-After; the boundary shows a calm "please wait" page. */
function rateLimited(retryAfterSeconds: number): never {
  throw data({ retryAfterMinutes: Math.max(1, Math.ceil(retryAfterSeconds / 60)) }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } });
}

/**
 * `site/tracking` loader (contracts.md): order summary, items, `payment`, `refund`,
 * `progress`, `canCancel` and `whatsappUrl`. No contact details or admin note are returned:
 * the link may be forwarded. The format is checked before the database; wrong and unknown
 * tokens share one 404 path after the same single statement, which also counts the request
 * (RL-track, FR-026).
 */
export async function loader({ request, url, params, context }: Route.LoaderArgs) {
  if (!isTrackingToken(params.token)) throw data(null, { status: 404 });
  const db = context.get(requestDbContext).db;
  const now = context.get(clockContext).now();
  const bucket = rateLimitBucketFor(RL_TRACK, trackSubject(request), now);
  const { order, attempts } = await findTrackedOrder(db, params.token, bucket);
  const verdict = rateLimitVerdict(RL_TRACK, bucket.windowStart, attempts, now);
  if (!verdict.ok) rateLimited(verdict.retryAfterSeconds);
  if (!order) throw data(null, { status: 404 });
  const moveTo = orderLanguageRedirect(request, url, order.locale);
  if (moveTo) throw redirect(moveTo);
  const locale = localeFromPathname(url.pathname);
  // One query: the order, its items and the Settings it is shown with (ADR-0003 amendment 3).
  const { id: _id, locale: _orderLocale, number, orderNumberPrefix, payment: settings, createdAt, refundDueRs, refundedAt, contactWhatsapp, source, ...shown } = order;
  const reference = formatOrderNumber(orderNumberPrefix, number);
  const isRequest = source === "custom_request";
  // A workshop registration (E-15): the event's title and address instead of a pickup. Never the
  // allergies or the people's names on this token page (it may be shared).
  const registration = source === "workshop" ? (await findOrderWorkshops(db, [order.id])).get(order.id) : undefined;
  return {
    isRequest,
    workshop: registration ? { title: locale === "fr" && registration.titleFr ? registration.titleFr : registration.titleEn, address: registration.address, mapUrl: registration.mapUrl } : null,
    /** This page, for the "Reload" link after a refused answer. */
    selfPath: url.pathname,
    // A custom request's quote (E-08 S-158): the server's amount, note and expiry; Accept and
    // Decline only while Quote sent and not past 23:59 MU on the expiry day.
    quote: isRequest ? await quoteView(db, order.id, order.status, todayMU(now), locale) : null,
    justAccepted: url.searchParams.get("accepted") === "1" && order.status !== "quote_sent",
    title: translate("order.tracking.metaTitle", locale),
    order: { ...shown, number: reference, dateLabel: formatDayLabel(order.fulfilOn, locale) },
    // The Juice instructions only while the order waits for its payment (S-278 AC5).
    payment: order.status === "awaiting_payment" ? paymentView({ totalRs: order.totalRs, reference, createdAt, settings, locale }) : null,
    // A refused paid order (S-281 AC4): the refund still to come, or the day it was sent.
    refund: refundDueRs === null ? null : { amountRs: refundDueRs, refundedOn: refundedAt ? formatDayLabel(todayMU(refundedAt), locale) : null },
    progress: customerProgress(order.status, order.fulfilment, source),
    canCancel: canCustomerCancel(order),
    whatsappUrl: whatsappUrl(contactWhatsapp, reference, locale),
    /** Set by the redirect after the customer's own cancel, so the page can say it worked. */
    justCancelled: url.searchParams.get("cancelled") === "1" && order.status === "cancelled",
  };
}

async function quoteView(db: Parameters<typeof findQuote>[0], orderId: string, status: Parameters<typeof canRespondToQuote>[0], today: string, locale: Locale) {
  const quote = await findQuote(db, orderId);
  if (!quote) return null;
  return {
    amountRs: quote.amountRs,
    note: quote.note,
    expiresLabel: formatLongDate(quote.expiresOn, locale),
    canRespond: canRespondToQuote(status, quote.expiresOn, today),
    expired: status === "quote_sent" && isQuoteExpired(quote.expiresOn, today),
  };
}

/** `acceptQuote` / `declineQuote { version }` (S-158, S-159): QUOTE_EXPIRED and INVALID_TRANSITION before ORDER_CHANGED; success redirects back. */
async function answerQuote(intent: "acceptQuote" | "declineQuote", token: string, version: number, ctx: { db: Parameters<typeof acceptQuote>[0]; now: Date; url: URL; locale: Locale; answered?: () => unknown }) {
  const input = { token, version, today: todayMU(ctx.now), now: ctx.now };
  const result = intent === "acceptQuote" ? await acceptQuote(ctx.db, input) : await declineQuote(ctx.db, input);
  // Admins are alerted by push after the response (E-10 S-195 AC2); the email rows came with the answer.
  if (result.ok) await ctx.answered?.();
  if (result.ok) return redirect(intent === "acceptQuote" ? `${ctx.url.pathname}?accepted=1` : `${ctx.url.pathname}?declined=1`);
  if (result.code === "NOT_FOUND") throw data(null, { status: 404 });
  return actionError(result.code, ctx.locale, { extra: { intent } });
}

/** The bakery's public WhatsApp as a wa.me link (a local number gets +230), prefilled with the order number (S-094 AC1). */
function whatsappUrl(number: string | null, reference: string, locale: Locale): string | null {
  const e164 = number ? normalizePhone(number) : null;
  return e164 ? whatsappHref(e164, translate("order.tracking.whatsappText", locale, { number: reference })) : null;
}

/**
 * `cancel { version }` (S-096): RL-track, then the token (same 404 as the page), then the
 * status rule before the version (CANCEL_NOT_ALLOWED, ORDER_CHANGED). Success redirects back
 * to the page (post/redirect/get, so it works without JavaScript).
 */
export async function action({ request, url, params, context }: Route.ActionArgs) {
  if (!isTrackingToken(params.token)) throw data(null, { status: 404 });
  const locale = localeFromPathname(url.pathname);
  const db = context.get(requestDbContext).db;
  const now = context.get(clockContext).now();
  const limit = await consumeRateLimit(db, RL_TRACK, trackSubject(request), now);
  if (!limit.ok) return rateLimitedResult(limit.retryAfterSeconds, locale, {});
  const form = Object.fromEntries(await request.formData());
  const version = Version.safeParse(form.version);
  if ((form.intent === "acceptQuote" || form.intent === "declineQuote") && version.success) {
    const event = form.intent === "acceptQuote" ? "quote_accepted" : "quote_declined";
    return answerQuote(form.intent, params.token, version.data, { db, now, url, locale, answered: () => alertAdmins(context, event, { trackingToken: params.token }) });
  }
  // Customers cannot edit orders (S-096 AC9): cancel and the quote answers are the only intents.
  if (form.intent !== "cancel" || !version.success) return actionError("VALIDATION_FAILED", locale);
  const result = await cancelOrderByCustomer(db, { token: params.token, version: version.data, now });
  if (result.ok) {
    // Admin push after the response (S-195 AC2); the email rows were queued with the cancel.
    await alertAdmins(context, "customer_cancelled", { trackingToken: params.token });
    return redirect(`${url.pathname}?cancelled=1`);
  }
  if (result.code === "NOT_FOUND") throw data(null, { status: 404 });
  return actionError(result.code, locale);
}

/** A refused cancel (409) still reloads the order, so the page shows what changed (S-096 AC4, AC5). */
export function shouldRevalidate({ actionStatus, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  return actionStatus === 409 ? true : defaultShouldRevalidate;
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

type TrackedView = Route.ComponentProps["loaderData"]["order"];

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

type TrackedWorkshop = { title: string; address: string; mapUrl: string | null } | null;

function OrderFacts({ order, workshop }: { order: TrackedView; workshop: TrackedWorkshop }) {
  const { t, locale } = useI18n();
  const windowText = t("checkout.windowLabel", { label: localized(order.window.label, locale), start: order.window.start, end: order.window.end });
  return (
    <dl className="mt-4 grid gap-3">
      {workshop && <Fact term={t("workshops.tracking.event")}>{workshop.title}</Fact>}
      <Fact term={t("order.tracking.date")}>{order.dateLabel}</Fact>
      <Fact term={t("order.tracking.time")}>{windowText}</Fact>
      {workshop ? (
        <Fact term={t("workshops.where")}>
          {workshop.address}
          {workshop.mapUrl && (
            <>
              {" "}
              <a href={workshop.mapUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-semibold link">
                {t("workshops.map")}
              </a>
            </>
          )}
        </Fact>
      ) : (
        <Fact term={t("order.tracking.fulfilment")}>{order.fulfilment === "delivery" ? t("order.tracking.delivery") : t("order.tracking.pickup")}</Fact>
      )}
      {order.address && <Fact term={t("order.tracking.address")}>{order.address}</Fact>}
      {order.landmark && <Fact term={t("order.tracking.landmark")}>{order.landmark}</Fact>}
    </dl>
  );
}

function ItemsAndTotal({ order, workshop }: { order: TrackedView; workshop: TrackedWorkshop }) {
  const { t, locale } = useI18n();
  return (
    <div className="mt-6 grid gap-2 rounded-lg bg-muted p-5">
      <ul className="grid gap-2">
        {order.items.map((item, index) => (
          <li key={index}>
            <p className={row}>
              <span>{t("checkout.itemLine", { name: localized(item.name, locale), quantity: item.quantity })}</span>
              {money(item.lineTotalRs)}
            </p>
            {item.options.length > 0 && <p className="text-sm">{item.options.map((o) => localized(o.label, locale)).join(", ")}</p>}
            {item.cakeMessage && <p className="text-sm">{t("order.tracking.cakeMessage", { message: item.cakeMessage })}</p>}
          </li>
        ))}
      </ul>
      {order.fulfilment === "delivery" ? (
        <p className={row}>
          <span>{t("checkout.feeLine")}</span>
          {money(order.deliveryFeeRs)}
        </p>
      ) : workshop ? null : (
        <p>{t("checkout.pickupFree")}</p>
      )}
      <p className={`${row} border-t border-input pt-2 text-lg font-semibold`}>
        <span>{t("checkout.total")}</span>
        {money(order.totalRs)}
      </p>
    </div>
  );
}

function WhatsappLink({ href }: { href: string | null }) {
  const { t } = useI18n();
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center font-semibold link">
      {t("order.tracking.whatsapp")}
    </a>
  );
}

/** Where the order stands beyond the progress list: paid, refused (with the refund), cancelled. */
function OrderState({ data: { order, refund, whatsappUrl, justCancelled } }: { data: Route.ComponentProps["loaderData"] }) {
  const { t } = useI18n();
  if (order.status === "approved" && order.paid) {
    return (
      <Alert tone="success" title={t("order.payment.paidTitle")} className="mt-6">
        <p>{t("order.payment.paidBody")}</p>
      </Alert>
    );
  }
  if (order.status === "declined") {
    return (
      <Alert tone="warning" title={t("order.tracking.declinedTitle")} className="mt-6">
        {order.declineReason && <p className="wrap-anywhere">{t("order.tracking.declinedReason", { reason: order.declineReason })}</p>}
        {refund && (
          <p className="mt-1 font-semibold">
            {refund.refundedOn
              ? t("order.tracking.refunded", { amount: formatRupees(refund.amountRs), date: refund.refundedOn })
              : t("order.tracking.refundDue", { amount: formatRupees(refund.amountRs) })}
          </p>
        )}
        <p className="mt-1">{t("order.tracking.declinedBody")}</p>
        <WhatsappLink href={whatsappUrl} />
      </Alert>
    );
  }
  if (order.status === "cancelled") return <CancelledAlert unpaid={order.cancelReason === "unpaid"} justCancelled={justCancelled} whatsappUrl={whatsappUrl} />;
  if (order.status === "closed") {
    return (
      <Alert tone="info" title={t("order.tracking.closedTitle")} className="mt-6">
        <p>{t("order.tracking.closedBody")}</p>
        <WhatsappLink href={whatsappUrl} />
      </Alert>
    );
  }
  return null;
}

/**
 * Cancelled (S-095 AC2): by the 24 h payment rule, or by the customer. Right after the
 * customer's own cancel it says so and takes focus, so the dialog's outcome is announced (S-096 AC1).
 */
function CancelledAlert({ unpaid, justCancelled, whatsappUrl }: { unpaid: boolean; justCancelled: boolean; whatsappUrl: string | null }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (justCancelled) ref.current?.focus();
  }, [justCancelled]);
  return (
    <Alert
      ref={ref}
      tabIndex={-1}
      role={justCancelled ? "status" : undefined}
      tone="warning"
      title={unpaid ? t("order.tracking.cancelledUnpaidTitle") : t("order.tracking.cancelledTitle")}
      className="mt-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {unpaid && <p>{t("order.tracking.cancelledUnpaidBody")}</p>}
      {justCancelled && <p>{t("order.tracking.cancel.done")}</p>}
      <WhatsappLink href={whatsappUrl} />
    </Alert>
  );
}

/** The WhatsApp button, named with the order number (S-094 AC8). */
function WhatsappButton({ url, number }: { url: string; number: string }) {
  const { t } = useI18n();
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "lg", className: "mt-3 max-w-full whitespace-normal" })}>
      <MessageCircle aria-hidden="true" />
      {t("order.tracking.whatsappButton", { number })}
    </a>
  );
}

const STOPPED = new Set(["declined", "cancelled", "closed"]);

/**
 * Changes and cancelling (S-096 AC1, AC3, AC9): Cancel while allowed; otherwise the WhatsApp
 * guidance with the 48-hour rule. Never an edit control. Final states already offer WhatsApp
 * in their Alert.
 */
function ChangeSection({ data, refusal }: { data: Route.ComponentProps["loaderData"]; refusal: CancelRefusal | undefined }) {
  const { t } = useI18n();
  const { order, canCancel, whatsappUrl } = data;
  if (STOPPED.has(order.status)) return <CancelRefusalAlert refusal={refusal} />;
  return (
    <section aria-labelledby="change-heading" className="mt-8">
      <h2 id="change-heading" className="section-title-start text-h2">
        {t("order.tracking.changeTitle")}
      </h2>
      <CancelRefusalAlert refusal={refusal} />
      <p className="mt-2 max-w-measure">{t(canCancel ? "order.tracking.noEdit" : "order.tracking.changeOrCancel")}</p>
      {whatsappUrl && <WhatsappButton url={whatsappUrl} number={order.number} />}
      {canCancel && <CancelOrder number={order.number} version={order.version} refusal={refusal} />}
    </section>
  );
}

export default function Tracking({ loaderData, actionData }: Route.ComponentProps) {
  const { t, locale } = useI18n();
  const { order, payment, progress } = loaderData;
  const quoteAnswer = actionData && !actionData.ok && "intent" in actionData;
  const refusal = actionData && !actionData.ok && !quoteAnswer ? (actionData.error as CancelRefusal) : undefined;
  const quoteRefusal = quoteAnswer ? (actionData.error as QuoteRefusal) : undefined;
  return (
    <>
      <h1>{t("order.tracking.heading", { number: order.number })}</h1>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="sr-only">{t("order.tracking.status")}:</span>
        <StatusBadge status={order.status} />
        <span className="inline-flex min-h-6 items-center rounded-full border-2 border-input bg-background px-3 py-0.5 text-sm font-semibold">
          {order.paid ? t("order.tracking.paid") : t("order.tracking.unpaid")}
        </span>
      </div>
      {payment && <PaymentInstructions view={payment} />}
      {loaderData.isRequest && (
        <QuotePanel
          status={order.status}
          quote={loaderData.quote}
          version={order.version}
          refusal={quoteRefusal}
          justAccepted={loaderData.justAccepted}
          newRequestHref={localePath(locale, "/custom-cake")}
          reloadHref={loaderData.selfPath}
        />
      )}
      <OrderState data={loaderData} />
      {order.status === "pending_approval" && (
        <Alert tone="info" title={t("order.confirmed.notConfirmedTitle")} className="mt-6">
          <p>{t("order.confirmed.notConfirmedBody")}</p>
        </Alert>
      )}
      {/* Declined, cancelled and closed have their Alert above instead of the progress list (S-095 AC2). */}
      {progress ? (
        <StatusProgress steps={progress.steps} current={progress.current} />
      ) : (
        !STOPPED.has(order.status) && <p className="mt-6 max-w-measure">{t("order.tracking.otherStatusHint")}</p>
      )}
      <section aria-labelledby="details-heading" className="mt-8">
        <h2 id="details-heading" className="section-title-start text-h2">
          {t("order.tracking.detailsTitle")}
        </h2>
        <OrderFacts order={order} workshop={loaderData.workshop} />
        {/* A custom request has no items: its price is the quote above (E-08). */}
        {!loaderData.isRequest && <ItemsAndTotal order={order} workshop={loaderData.workshop} />}
      </section>
      <ChangeSection data={loaderData} refusal={refusal} />
    </>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const { t } = useI18n();
  if (isRouteErrorResponse(error) && error.status === 404) return <OrderNotFound />;
  if (isRouteErrorResponse(error) && error.status === 429) {
    const minutes = (error.data as { retryAfterMinutes?: number } | null)?.retryAfterMinutes ?? 10;
    return (
      <>
        <h1>{t("order.tracking.rateLimitedTitle")}</h1>
        <p className="mt-4 max-w-measure">{t("order.tracking.rateLimitedBody", { minutes })}</p>
      </>
    );
  }
  return (
    <>
      <h1>{t("errors.genericTitle")}</h1>
      <p className="mt-4">{t("errors.genericBody")}</p>
    </>
  );
}
