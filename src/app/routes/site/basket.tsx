import { useEffect, useRef, useState } from "react";
import { Form, redirect, useNavigation } from "react-router";
import { BasketLineItem, type BasketLineView } from "~/components/checkout/basket-line-item";
import { DateSection, DetailsSection, TimeSection } from "~/components/checkout/checkout-steps";
import { ErrorSummary } from "~/components/checkout/error-summary";
import { type FulfilmentChoice, FulfilmentSection } from "~/components/checkout/fulfilment-section";
import { PlaceOrderBar, SummarySection } from "~/components/checkout/summary-section";
import { type BasketLine, removeLine, setLineQuantity } from "~/domain/basket";
import { checkoutTotals, deliveryFeeFor, priceLines } from "~/domain/pricing";
import { formatDayLabel, todayMU } from "~/domain/time";
import { t as translate } from "~/i18n/catalog.server";
import { localized } from "~/i18n/localized";
import { useI18n } from "~/i18n/react";
import { publicImageUrl } from "~/lib/images";
import { type Locale, formatRupees, localeFromPathname, localePath } from "~/lib/locale";
import { type ActionErrorBody, actionError } from "~/server/action-result.server";
import { basketCookie, clearBasketCookie, readBasket } from "~/server/basket.server";
import { clockContext } from "~/server/clock.server";
import { RemoveLineInput, UpdateLineInput } from "~/server/contracts/site";
import { requestDbContext } from "~/server/db.server";
import { publicConfigContext } from "~/server/public-config.server";
import { findProductsByIds } from "~/server/repos/catalogue.server";
import { getCheckoutSettings } from "~/server/repos/settings.server";
import { type PlaceOrderResult, placeOrder } from "~/server/services/place-order.server";
import type { Route } from "./+types/basket";

/** `site/basket` loader (contracts.md; minimal slice: no day statuses, prefill or reorder yet). */
export async function loader({ request, url, context }: Route.LoaderArgs) {
  const db = context.get(requestDbContext).db;
  const locale = localeFromPathname(url.pathname);
  const basket = readBasket(request);
  const products = await findProductsByIds(db, basket.map((l) => l.productId));
  const settings = await getCheckoutSettings(db);
  const { supabaseUrl } = context.get(publicConfigContext);
  const lines = priceLines(basket, products).map((line) => {
    const photo = products.get(line.productId)?.photos[0];
    return { ...line, imageUrl: photo ? publicImageUrl(photo.storagePath, supabaseUrl) : null };
  });
  const today = todayMU(context.get(clockContext).now());
  return {
    title: translate("basket.metaTitle", locale),
    lines,
    itemsTotalRs: checkoutTotals(lines, null, settings.deliveryFeeRs).itemsTotalRs,
    deliveryFeeRs: settings.deliveryFeeRs,
    windows: settings.windows,
    pickup: settings.pickup,
    payment: settings.payment,
    policies: settings.policies,
    earliestDate: today,
    earliestDateLabel: formatDayLabel(today, locale),
    // Rendered into the form so S-014 can make a repeated submit return the same order.
    idempotencyKey: crypto.randomUUID(),
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

/** The typed values sent back with a refusal, so a no-JavaScript page keeps them (never prices). */
const ECHOED = ["fulfilment", "address", "landmark", "date", "windowId.delivery", "windowId.pickup", "contact.name", "contact.phone", "contact.email", "contact.note", "acceptPolicies", "displayedTotalRs"];

function echo(form: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(ECHOED.flatMap((key) => (typeof form[key] === "string" ? [[key, form[key] as string]] : [])));
}

/** Form field name -> its message key (dots are key separators in the catalogue). */
const fieldMessageKey = (field: string) => `checkout.errors.${field.replace(/\.(\w)/g, (_, c: string) => c.toUpperCase())}`;

function fieldMessages(fields: string[], locale: Locale): Record<string, string> {
  const known = new Set(["basket", "fulfilment", "address", "landmark", "date", "windowId", "contact.name", "contact.phone", "contact.email", "contact.note", "acceptPolicies"]);
  return Object.fromEntries(fields.map((f) => (known.has(f) ? [f, translate(fieldMessageKey(f), locale)] : ["form", translate("checkout.errors.form", locale)])));
}

function refusal(result: Exclude<PlaceOrderResult, { ok: true }>, values: Record<string, string>, locale: Locale) {
  switch (result.code) {
    case "VALIDATION_FAILED":
      return actionError(result.code, locale, { fields: fieldMessages(result.fields, locale), extra: { values } });
    case "DATE_UNAVAILABLE":
      return actionError(result.code, locale, { fields: { date: translate("checkout.errors.dateTooSoon", locale) }, extra: { values, reason: result.reason } });
    case "PRODUCT_UNAVAILABLE":
      return actionError(result.code, locale, { extra: { values, lineIds: result.lineIds } });
    case "PRICE_CHANGED": {
      const { lines, itemsTotalRs, deliveryFeeRs, totalRs } = result;
      return actionError(result.code, locale, { extra: { values, lines, itemsTotalRs, deliveryFeeRs, totalRs } });
    }
  }
}

async function submitOrder(form: Record<string, unknown>, args: Route.ActionArgs, locale: Locale) {
  const { request, context } = args;
  const result = await placeOrder(form, {
    db: context.get(requestDbContext).db,
    now: context.get(clockContext).now(),
    locale,
    basket: readBasket(request),
  });
  if (!result.ok) return refusal(result, echo(form), locale);
  return redirect(localePath(locale, `/order/${result.trackingToken}/confirmed`), { headers: { "Set-Cookie": clearBasketCookie() } });
}

export async function action(args: Route.ActionArgs) {
  const locale = localeFromPathname(args.url.pathname);
  const form = Object.fromEntries(await args.request.formData());
  switch (form.intent) {
    case "updateLine":
      return updateLine(form, args.request, locale);
    case "removeLine":
      return removeBasketLine(form, args.request, locale);
    case "placeOrder":
      return submitOrder(form, args, locale);
    default:
      return actionError("VALIDATION_FAILED", locale);
  }
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex" }];
}

type LoaderData = Route.ComponentProps["loaderData"];
type ActionData = Route.ComponentProps["actionData"];

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

function BasketSection({ lines, itemsTotalRs, lineError }: { lines: BasketLineView[]; itemsTotalRs: number; lineError?: string }) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="basket-heading" className="mt-8">
      <h2 id="basket-heading" tabIndex={-1} className="text-2xl outline-none">
        {t("checkout.sections.basket")}
      </h2>
      {lineError && (
        <p role="alert" className="mt-3 font-semibold text-destructive">
          {lineError}
        </p>
      )}
      <ul className="mt-2">
        {lines.map((line) => (
          <BasketLineItem key={line.lineId} line={line} />
        ))}
      </ul>
      <p className="mt-2 flex flex-wrap justify-between gap-x-4 text-lg font-semibold">
        <span>{t("basket.subtotal")}</span>
        <span className="whitespace-nowrap">{formatRupees(itemsTotalRs)}</span>
      </p>
    </section>
  );
}

/** A refused placeOrder as the view reads it (the error envelope plus echoed values). */
interface OrderRefusal extends ActionErrorBody {
  values: Record<string, string>;
  totalRs?: number;
}

/** Refusal of placeOrder (has `values`) vs. a basket line refusal. */
function orderRefusal(actionData: ActionData): OrderRefusal | undefined {
  return actionData && !actionData.ok && "values" in actionData ? (actionData as unknown as OrderRefusal) : undefined;
}

function useFocusOnRefusal(refused: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (refused) ref.current?.focus();
  }, [refused]);
  return ref;
}

function priceChangeDetail(refused: OrderRefusal, t: (key: string, v?: Record<string, string>) => string) {
  if (refused.totalRs === undefined) return undefined;
  const old = Number(refused.values.displayedTotalRs);
  return t("checkout.priceChanged", { old: formatRupees(Number.isFinite(old) ? old : 0), new: formatRupees(refused.totalRs) });
}

function CheckoutForm({ data, refused }: { data: LoaderData; refused: OrderRefusal | undefined }) {
  const { t, locale } = useI18n();
  const navigation = useNavigation();
  const values = refused?.values ?? {};
  const initialChoice = values.fulfilment === "delivery" || values.fulfilment === "pickup" ? values.fulfilment : null;
  const [fulfilment, setFulfilment] = useState<FulfilmentChoice | null>(initialChoice);
  const summaryRef = useFocusOnRefusal(refused);
  const errors = refused?.error.fields ?? {};
  const totalRs = data.itemsTotalRs + deliveryFeeFor(fulfilment, data.deliveryFeeRs);
  const submitting = navigation.state === "submitting" && navigation.formData?.get("intent") === "placeOrder";
  const label = refused?.error.code === "PRICE_CHANGED" ? t("checkout.placeOrderAt", { total: formatRupees(totalRs) }) : t("checkout.placeOrder");
  const items = data.lines.filter((l) => l.problem === null).map((l) => ({ lineId: l.lineId, name: localized(l.name, locale), quantity: l.quantity, lineTotalRs: l.lineTotalRs }));
  return (
    <Form method="post" noValidate className="checkout-form">
      {refused && <ErrorSummary ref={summaryRef} message={refused.error.message} detail={priceChangeDetail(refused, t)} fields={refused.error.fields} />}
      <input type="hidden" name="idempotencyKey" value={data.idempotencyKey} />
      <input type="hidden" name="displayedTotalRs" value={totalRs} />
      <FulfilmentSection deliveryFee={formatRupees(data.deliveryFeeRs)} pickupAddress={data.pickup.address} pickupMapUrl={data.pickup.mapUrl} initial={values} errors={errors} onChoose={setFulfilment} />
      <DateSection today={data.earliestDate} todayLabel={data.earliestDateLabel} initial={values.date} error={errors.date} />
      <TimeSection windows={data.windows} initial={values} error={errors.windowId} />
      <DetailsSection initial={values} errors={errors} />
      <SummarySection
        items={items}
        itemsTotalRs={data.itemsTotalRs}
        deliveryFeeRs={data.deliveryFeeRs}
        juiceNumber={data.payment.juiceNumber}
        policies={data.policies ? localized(data.policies, locale) : t("checkout.policiesDefault")}
        errors={errors}
        initialAccepted={values.acceptPolicies === "on"}
      />
      <PlaceOrderBar itemsTotalRs={data.itemsTotalRs} deliveryFeeRs={data.deliveryFeeRs} label={label} submitting={submitting} />
    </Form>
  );
}

export default function Basket({ loaderData, actionData }: Route.ComponentProps) {
  const { t, locale } = useI18n();
  const lines = lineViews(loaderData, locale, t);
  const refused = orderRefusal(actionData);
  const lineError = actionData && !actionData.ok && !refused ? actionData.error.message : undefined;
  return (
    <>
      <h1>{t("basket.metaTitle")}</h1>
      {lines.length === 0 ? (
        <EmptyBasket />
      ) : (
        <>
          <BasketSection lines={lines} itemsTotalRs={loaderData.itemsTotalRs} lineError={lineError} />
          <CheckoutForm data={loaderData} refused={refused} />
        </>
      )}
    </>
  );
}
