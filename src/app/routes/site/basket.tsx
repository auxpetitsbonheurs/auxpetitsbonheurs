import { Form, redirect } from "react-router";
import { BasketLineItem, type BasketLineView } from "~/components/checkout/basket-line-item";
import { FulfilmentSection } from "~/components/checkout/fulfilment-section";
import { type BasketLine, removeLine, setLineQuantity } from "~/domain/basket";
import { checkoutTotals, priceLines } from "~/domain/pricing";
import { t as translate } from "~/i18n/catalog.server";
import { localized } from "~/i18n/localized";
import { useI18n } from "~/i18n/react";
import { publicImageUrl } from "~/lib/images";
import { type Locale, formatRupees, localeFromPathname, localePath } from "~/lib/locale";
import { actionError } from "~/server/action-result.server";
import { basketCookie, readBasket } from "~/server/basket.server";
import { RemoveLineInput, UpdateLineInput } from "~/server/contracts/site";
import { requestDbContext } from "~/server/db.server";
import { publicConfigContext } from "~/server/public-config.server";
import { findProductsByIds } from "~/server/repos/catalogue.server";
import { getCheckoutSettings } from "~/server/repos/settings.server";
import type { Route } from "./+types/basket";

/** `site/basket` loader (contracts.md; minimal slice: no day statuses, prefill or reorder yet). */
export async function loader({ request, url, context }: Route.LoaderArgs) {
  const db = context.get(requestDbContext).db;
  const basket = readBasket(request);
  const products = await findProductsByIds(db, basket.map((l) => l.productId));
  const settings = await getCheckoutSettings(db);
  const { supabaseUrl } = context.get(publicConfigContext);
  const lines = priceLines(basket, products).map((line) => {
    const photo = products.get(line.productId)?.photos[0];
    return { ...line, imageUrl: photo ? publicImageUrl(photo.storagePath, supabaseUrl) : null };
  });
  return {
    title: translate("basket.metaTitle", localeFromPathname(url.pathname)),
    lines,
    itemsTotalRs: checkoutTotals(lines, null, settings.deliveryFeeRs).itemsTotalRs,
    deliveryFeeRs: settings.deliveryFeeRs,
    windows: settings.windows,
    pickup: settings.pickup,
    payment: settings.payment,
  };
}

function saveBasket(lines: BasketLine[], locale: Locale) {
  // Redirect (post/redirect/get) so a no-JavaScript post re-renders from the new cookie.
  return redirect(localePath(locale, "/basket"), { headers: { "Set-Cookie": basketCookie(lines) } });
}

function updateLine(form: Record<string, unknown>, request: Request, locale: Locale) {
  const parsed = UpdateLineInput.safeParse(form);
  if (!parsed.success) {
    return actionError("VALIDATION_FAILED", locale, { fields: { quantity: translate("basket.errors.quantity", locale) } });
  }
  return saveBasket(setLineQuantity(readBasket(request), parsed.data.lineId, parsed.data.quantity), locale);
}

function removeBasketLine(form: Record<string, unknown>, request: Request, locale: Locale) {
  const parsed = RemoveLineInput.safeParse(form);
  if (!parsed.success) return actionError("VALIDATION_FAILED", locale);
  return saveBasket(removeLine(readBasket(request), parsed.data.lineId), locale);
}

export async function action({ request, url }: Route.ActionArgs) {
  const locale = localeFromPathname(url.pathname);
  const form = Object.fromEntries(await request.formData());
  switch (form.intent) {
    case "updateLine":
      return updateLine(form, request, locale);
    case "removeLine":
      return removeBasketLine(form, request, locale);
    default:
      return actionError("VALIDATION_FAILED", locale);
  }
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex" }];
}

type LoaderData = Route.ComponentProps["loaderData"];

function lineViews(data: LoaderData, locale: Locale, t: (key: string) => string): BasketLineView[] {
  return data.lines.map((line) => ({
    lineId: line.lineId,
    name: line.name.en ? localized(line.name, locale) : t("basket.unavailableItem"),
    imageUrl: line.imageUrl,
    quantity: line.quantity,
    unitPrice: formatRupees(line.unitPriceRs),
    lineTotal: formatRupees(line.lineTotalRs),
    problem: line.problem ? t(`basket.problems.${line.problem}`) : null,
  }));
}

function EmptyBasket() {
  const { t, locale } = useI18n();
  return (
    <>
      <p className="mt-6 text-lg">{t("basket.empty")}</p>
      <p className="mt-4">
        {/* "See the menu" goes home until the menu page exists (E-04). */}
        <a href={localePath(locale, "/")} className="inline-flex min-h-11 items-center font-semibold text-primary-strong underline underline-offset-4">
          {t("basket.seeMenu")}
        </a>
      </p>
    </>
  );
}

function Totals({ itemsTotalRs, deliveryFeeRs }: { itemsTotalRs: number; deliveryFeeRs: number }) {
  const { t } = useI18n();
  const row = "flex flex-wrap justify-between gap-x-4 text-lg font-semibold";
  const amount = (rs: number) => <span className="whitespace-nowrap">{formatRupees(rs)}</span>;
  return (
    <div className="mt-8 rounded-lg bg-muted p-4">
      <div data-when="none">
        <p className={row}>
          <span>{t("checkout.totalItemsOnly")}</span>
          {amount(itemsTotalRs)}
        </p>
        <p className="mt-1">{t("checkout.chooseFulfilmentFirst")}</p>
      </div>
      <p data-when="delivery" className={row}>
        <span>{t("checkout.total")}</span>
        {amount(itemsTotalRs + deliveryFeeRs)}
      </p>
      <p data-when="pickup" className={row}>
        <span>{t("checkout.total")}</span>
        {amount(itemsTotalRs)}
      </p>
    </div>
  );
}

export default function Basket({ loaderData, actionData }: Route.ComponentProps) {
  const { t, locale } = useI18n();
  const lines = lineViews(loaderData, locale, t);
  return (
    <>
      <h1>{t("basket.metaTitle")}</h1>
      {lines.length === 0 ? (
        <EmptyBasket />
      ) : (
        <>
          <section aria-labelledby="basket-heading" className="mt-8">
            <h2 id="basket-heading" className="text-2xl">
              {t("checkout.sections.basket")}
            </h2>
            {actionData && !actionData.ok && (
              <p role="alert" className="mt-3 font-semibold text-destructive">
                {actionData.error.message}
              </p>
            )}
            <ul className="mt-2">
              {lines.map((line) => (
                <BasketLineItem key={line.lineId} line={line} />
              ))}
            </ul>
            <p className="mt-2 flex flex-wrap justify-between gap-x-4 text-lg font-semibold">
              <span>{t("basket.subtotal")}</span>
              <span className="whitespace-nowrap">{formatRupees(loaderData.itemsTotalRs)}</span>
            </p>
          </section>
          <Form method="post" noValidate className="checkout-form">
            <FulfilmentSection
              deliveryFee={formatRupees(loaderData.deliveryFeeRs)}
              pickupAddress={loaderData.pickup.address}
              pickupMapUrl={loaderData.pickup.mapUrl}
              initial={{}}
              errors={{}}
            />
            <Totals itemsTotalRs={loaderData.itemsTotalRs} deliveryFeeRs={loaderData.deliveryFeeRs} />
          </Form>
        </>
      )}
    </>
  );
}
