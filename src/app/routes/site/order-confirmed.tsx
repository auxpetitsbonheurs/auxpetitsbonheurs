import { useEffect, useRef } from "react";
import { data, isRouteErrorResponse, redirect } from "react-router";
import { CopyButton, CopyStatus, ShareLink, useCopyStatus, useHydrated } from "~/components/order/copy-actions";
import { OrderNotFound } from "~/components/order/order-not-found";
import { Alert } from "~/components/ui/alert";
import { buttonVariants } from "~/components/ui/button";
import { formatOrderNumber } from "~/domain/order-number";
import { t as translate } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import { localeFromPathname, localePath } from "~/lib/locale";
import { requestDbContext } from "~/server/db.server";
import { findOrderRefByToken } from "~/server/repos/orders.server";
import { getCheckoutSettings } from "~/server/repos/settings.server";
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
  const db = context.get(requestDbContext).db;
  const order = await findOrderRefByToken(db, params.token);
  if (!order) throw data(null, { status: 404 });
  const moveTo = orderLanguageRedirect(request, url, order.locale);
  if (moveTo) throw redirect(moveTo);
  const locale = localeFromPathname(url.pathname);
  const { orderNumberPrefix } = await getCheckoutSettings(db);
  return {
    title: translate("order.confirmed.metaTitle", locale),
    number: formatOrderNumber(orderNumberPrefix, order.number),
    trackingUrl: `${url.origin}${localePath(order.locale, `/t/${order.trackingToken}`)}`,
    offerSaveDetails: false,
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

function NumberCard({ number, onCopy, copied }: { number: string; onCopy?: () => void; copied: boolean }) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="number-label" className="mt-6 rounded-lg bg-muted p-5">
      <h2 id="number-label" className="text-lg">
        {t("order.confirmed.numberLabel")}
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
  const { t } = useI18n();
  const heading = useFocusOnArrival();
  const hydrated = useHydrated();
  const { status, copy } = useCopyStatus();
  const { number, trackingUrl } = loaderData;
  const copiedNumber = t("order.confirmed.copiedNumber");
  const copiedLink = t("order.confirmed.copiedLink");
  return (
    <>
      <h1 ref={heading} tabIndex={-1} className="outline-none">
        {t("order.confirmed.heading")}
      </h1>
      <NumberCard number={number} copied={status === copiedNumber} onCopy={hydrated ? () => copy(number, copiedNumber) : undefined} />
      <Alert tone="info" title={t("order.confirmed.notConfirmedTitle")} className="mt-6">
        <p>{t("order.confirmed.notConfirmedBody")}</p>
      </Alert>
      <section aria-labelledby="tracking-label" className="mt-8">
        <h2 id="tracking-label" className="text-h2">
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
