import { useEffect, useRef } from "react";
import { Link, data, isRouteErrorResponse, redirect } from "react-router";
import { CopyButton, CopyStatus, ShareLink, useCopyStatus, useHydrated } from "~/components/order/copy-actions";
import { OrderNotFound } from "~/components/order/order-not-found";
import { PaymentInstructions } from "~/components/order/payment-instructions";
import { Alert } from "~/components/ui/alert";
import { buttonVariants } from "~/components/ui/button";
import { formatOrderNumber } from "~/domain/order-number";
import { t as translate } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import { type Locale, localeFromPathname, localePath } from "~/lib/locale";
import { clockContext } from "~/server/clock.server";
import { hasSignedInHint } from "~/server/customer-auth.server";
import { confirmationContext } from "~/server/confirmation-cookie.server";
import { localized } from "~/i18n/localized";
import { nameList } from "~/lib/left-out";
import { requestDbContext } from "~/server/db.server";
import { readLeftOut } from "~/server/left-out.server";
import { type PaymentView, paymentView } from "~/server/payment-view.server";
import { findOrderConfirmation } from "~/server/repos/orders.server";
import { isTrackingToken, orderLanguageRedirect, tokenPageHeaders } from "~/server/token-page.server";
import type { Route } from "./+types/order-confirmed";

/** no-store, noindex, no-referrer on every response of this route (NFR-004, threat-model G-07). */
export const middleware: Route.MiddlewareFunction[] = [tokenPageHeaders];

/**
 * `site/order-confirmed` loader (contracts.md; minimal slice: `offerSaveDetails` is false
 * and `email` ships with the Save-my-details card in E-11). Read-only, so a refresh
 * shows the same order (FR-025). The format is checked before the database (threat-model C1).
 */
export async function loader({ request, url, params, context }: Route.LoaderArgs) {
  if (!isTrackingToken(params.token)) throw data(null, { status: 404 });
  const locale = localeFromPathname(url.pathname);
  // Right after Place order (AC48): the signed `apb_confirmed` cookie the basket action set for
  // this order's path, so no database connection. Only in the order's own language (the
  // cookie's path); anything that does not verify, has expired or is absent reads the database.
  const signer = context.get(confirmationContext);
  const fresh = signer ? await signer.read(request, params.token, context.get(clockContext).now()) : undefined;
  // A cookie set before Juice payment carries no payment snapshot: read the database instead.
  // Only website orders set the cookie: a custom request always reads the database.
  if (fresh && fresh.locale === locale && fresh.payment) {
    const { totalRs, placedAt, ...settings } = fresh.payment;
    const payment = paymentView({ totalRs, reference: fresh.number, createdAt: new Date(placedAt), settings, locale });
    return confirmation(url, params.token, fresh.locale, fresh.number, fresh.leftOut, payment, false, offerSaveDetails(request, false));
  }
  // One query: the order, the number prefix and the left-out names (ADR-0003 amendment 3).
  // Left out (UX audit H1, AC41): product ids from the `apb_left_out` cookie the basket
  // action set for this page only (never personal data), named in the cookie's order.
  const leftOutIds = readLeftOut(request);
  const found = await findOrderConfirmation(context.get(requestDbContext).db, params.token, leftOutIds);
  if (!found) throw data(null, { status: 404 });
  const { ref: order, orderNumberPrefix } = found;
  const number = formatOrderNumber(orderNumberPrefix, order.number);
  const moveTo = orderLanguageRedirect(request, url, order.locale);
  if (moveTo) throw redirect(moveTo);
  const names = new Map(found.leftOut.map((p) => [p.id, p.name]));
  const leftOut = leftOutIds.flatMap((id) => {
    const name = names.get(id);
    return name ? [localized(name, locale)] : [];
  });
  // The instructions only while the order still waits for its payment (S-278 AC2, S-279 AC5).
  const payment = found.status === "awaiting_payment"
    ? paymentView({ totalRs: found.totalRs, reference: number, createdAt: found.createdAt, settings: found.payment, locale })
    : null;
  return confirmation(url, order.trackingToken, order.locale, number, leftOut, payment, found.isRequest, offerSaveDetails(request, found.isRequest));
}

/**
 * "Save your details for next time" (E-11 S-215 AC1, AC8: this page only): for a website order
 * when this browser has no customer session. Whether the email already has an account is not
 * read here (the page keeps its no-database path, AC48); the save-details page answers that
 * by offering sign-in instead (AC4).
 */
function offerSaveDetails(request: Request, isRequest: boolean): boolean {
  return !isRequest && !hasSignedInHint(request);
}

/** The page data, the same whether it came from the cookie or the database. */
function confirmation(url: URL, token: string, orderLocale: Locale, number: string, leftOut: string[], payment: PaymentView | null, isRequest: boolean, saveDetails: boolean) {
  return {
    title: translate(isRequest ? "customRequest.confirmed.metaTitle" : "order.confirmed.metaTitle", localeFromPathname(url.pathname)),
    /** A custom cake request (E-08 S-151 AC2): "Request received, we will send you a quote". */
    isRequest,
    number,
    trackingUrl: `${url.origin}${localePath(orderLocale, `/t/${token}`)}`,
    offerSaveDetails: saveDetails,
    saveDetailsUrl: localePath(localeFromPathname(url.pathname), `/account/save-details?t=${token}`),
    leftOut,
    payment,
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

/** Moves focus to the page heading on arrival (UX "on confirmation focus H1"). */
function useFocusOnArrival() {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return ref;
}

function NumberCard({ label, number, onCopy, copied }: { label: string; number: string; onCopy?: () => void; copied: boolean }) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="number-label" className="mt-6 rounded-lg bg-muted p-5">
      <h2 id="number-label" className="text-lg">
        {label}
      </h2>
      <p className="mt-1 font-heading text-4xl tabular-nums wrap-anywhere">{number}</p>
      {onCopy && (
        <div className="mt-3">
          <CopyButton label={t("order.confirmed.copyNumber")} copied={copied} onCopy={onCopy} />
        </div>
      )}
    </section>
  );
}

export default function OrderConfirmed({ loaderData }: Route.ComponentProps) {
  const { t, locale } = useI18n();
  const heading = useFocusOnArrival();
  const hydrated = useHydrated();
  const { status, copy } = useCopyStatus();
  const { number, trackingUrl, leftOut, payment, isRequest, offerSaveDetails: offerSave, saveDetailsUrl } = loaderData;
  const copiedNumber = t("order.confirmed.copiedNumber");
  const copiedLink = t("order.confirmed.copiedLink");
  return (
    <>
      <h1 ref={heading} tabIndex={-1} className="outline-none">
        {t(isRequest ? "customRequest.confirmed.heading" : "order.confirmed.heading")}
      </h1>
      {/* Pay first (S-278 AC2): the order is confirmed once the client sees the Juice payment. */}
      {payment && <PaymentInstructions view={payment} />}
      <NumberCard label={t(isRequest ? "customRequest.confirmed.numberLabel" : "order.confirmed.numberLabel")} number={number} copied={status === copiedNumber} onCopy={hydrated ? () => copy(number, copiedNumber) : undefined} />
      {leftOut.length > 0 && (
        <Alert tone="warning" title={t("order.confirmed.leftOutTitle")} className="mt-6">
          <p>{t("order.confirmed.leftOutBody", { count: leftOut.length, names: nameList(leftOut, locale) })}</p>
        </Alert>
      )}
      {isRequest && (
        <Alert tone="info" title={t("customRequest.notice")} className="mt-6">
          <p>{t("customRequest.confirmed.body")}</p>
        </Alert>
      )}
      <section aria-labelledby="tracking-label" className="mt-8">
        <h2 id="tracking-label" className="section-title-start text-h2">
          {t("order.confirmed.trackingTitle")}
        </h2>
        <p className="mt-2 max-w-measure">{t("order.confirmed.trackingHint")}</p>
        <p className="mt-3 rounded-md border border-input bg-card p-3 font-mono text-sm wrap-anywhere">{trackingUrl}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <a href={trackingUrl} className={buttonVariants({ size: "lg", className: "max-w-full" })}>
            {t("order.confirmed.followOrder")}
          </a>
          {hydrated && <CopyButton label={t("order.confirmed.copyLink")} copied={status === copiedLink} onCopy={() => copy(trackingUrl, copiedLink)} />}
          <ShareLink label={t("order.confirmed.share")} text={t("order.confirmed.shareText", { number, url: trackingUrl })} />
        </div>
      </section>
      {offerSave && (
        <section aria-labelledby="save-details" className="mt-8 rounded-card border border-border bg-card p-4 sm:p-6">
          <h2 id="save-details" className="text-xl">
            {t("order.confirmed.saveDetailsTitle")}
          </h2>
          <p className="mt-2 max-w-measure">{t("order.confirmed.saveDetailsBody")}</p>
          <Link to={saveDetailsUrl} className={buttonVariants({ variant: "outline", className: "mt-4 max-w-full" })}>
            {t("order.confirmed.saveDetailsAction")}
          </Link>
        </section>
      )}
      <CopyStatus status={status} />
    </>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const { t } = useI18n();
  if (isRouteErrorResponse(error) && error.status === 404) return <OrderNotFound />;
  return (
    <>
      <h1>{t("errors.genericTitle")}</h1>
      <p className="mt-4">{t("errors.genericBody")}</p>
    </>
  );
}
