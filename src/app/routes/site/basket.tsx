import { Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Form, type MetaArgs, redirect, useNavigation } from "react-router";
import { BasketLineItem, type BasketLineView, type RemovedLine } from "~/components/checkout/basket-line-item";
import { Alert } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { leftOutNames, nameList } from "~/lib/left-out";
import { DateSection, DetailsSection, TimeSection } from "~/components/checkout/checkout-steps";
import { ErrorSummary } from "~/components/checkout/error-summary";
import { type FulfilmentChoice, FulfilmentSection } from "~/components/checkout/fulfilment-section";
import { PlaceOrderBar, SummarySection } from "~/components/checkout/summary-section";
import { type BasketLine, removeLine, setLineQuantity } from "~/domain/basket";
import { type Menu, type MenuEntry, fresherEntry, menuWithServerPrices, priceBasket } from "~/domain/menu";
import { type LocalizedName, type PricedLine, checkoutTotals, deliveryFeeFor } from "~/domain/pricing";
import { formatDayLabel, todayMU } from "~/domain/time";
import { t as translate } from "~/i18n/catalog.server";
import { localized } from "~/i18n/localized";
import { useI18n } from "~/i18n/react";
import { basketStore, useBasketLines } from "~/lib/basket-store";
import { menuStore, useMenuState } from "~/lib/menu-cache";
import { isPendingIntent } from "~/lib/pending";
import { type Locale, formatRupees, localeFromPathname, localePath } from "~/lib/locale";
import { type ActionErrorBody, actionError } from "~/server/action-result.server";
import { basketCookie, clearBasketCookie, readBasket } from "~/server/basket.server";
import { leftOutCookie } from "~/server/left-out.server";
import { clockContext } from "~/server/clock.server";
import { confirmationContext } from "~/server/confirmation-cookie.server";
import { Uuid } from "~/server/contracts/shared";
import { RemoveLineInput, UpdateLineInput } from "~/server/contracts/site";
import { requestDbContext } from "~/server/db.server";
import { loadMenu } from "~/server/menu.server";
import { noStore } from "~/server/response-headers.server";
import { publicConfigContext } from "~/server/public-config.server";
import { findProductsByIds } from "~/server/repos/catalogue.server";
import { timed } from "~/server/server-timing.server";
import { type PlaceOrderResult, placeOrder } from "~/server/services/place-order.server";
import type { Route } from "./+types/basket";

/** no-store on the page, data requests and action results: the form carries a per-render idempotency key (M2). */
export const middleware: Route.MiddlewareFunction[] = [noStore];

/**
 * `site/basket` loader (contracts.md, ADR-0004): the visitor's basket lines and the public
 * menu they are priced from (the same data GET /api/menu serves, also seeding the browser
 * cache). Lines are priced by the view with `priceBasket`, on the server and in the browser.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(requestDbContext).db;
  const basket = readBasket(request);
  const menu = await timed(context, "menu", () =>
    loadMenu({ db, supabaseUrl: context.get(publicConfigContext).supabaseUrl, now: context.get(clockContext).now() }),
  );
  return {
    basket,
    menu,
    goneNames: await goneProductNames(context, basket, menu),
    today: menu.data.today,
    // Fresh per render; a repeated submit with it returns the same order (FR-023, S-014).
    idempotencyKey: crypto.randomUUID(),
  };
}

/** Names of the visitor's own basket products the menu leaves out (hidden), so the line can say what it was. */
async function goneProductNames(context: Route.LoaderArgs["context"], basket: BasketLine[], menu: MenuEntry): Promise<Record<string, LocalizedName>> {
  const listed = new Set(menu.data.products.map((p) => p.id));
  const missing = basket.map((l) => l.productId).filter((id) => !listed.has(id));
  if (missing.length === 0) return {};
  const found = await timed(context, "products", () => findProductsByIds(context.get(requestDbContext).db, missing));
  return Object.fromEntries([...found].map(([id, record]) => [id, record.name]));
}

/**
 * Client navigation (ADR-0004): render at once from the menu cached in the phone and the
 * basket cookie, then revalidate the menu in the background. No cache yet (or no
 * crypto.randomUUID for the idempotency key): ask the server as before.
 */
export async function clientLoader({ serverLoader }: Route.ClientLoaderArgs) {
  const entry = menuStore.state().entry;
  if (!entry || typeof crypto.randomUUID !== "function") return serverLoader();
  void menuStore.revalidate({ force: true });
  const clientToday = todayMU(new Date());
  return {
    basket: basketStore.lines(),
    menu: entry,
    goneNames: {} as Record<string, LocalizedName>,
    today: clientToday > entry.data.today ? clientToday : entry.data.today,
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
const ECHOED = ["fulfilment", "address", "landmark", "date", "windowId.delivery", "windowId.pickup", "contact.name", "contact.phone", "contact.email", "contact.note", "acceptPolicies", "displayedTotalRs", "displayedTotalRs.delivery", "displayedTotalRs.pickup"];

function echo(form: Record<string, unknown>): Record<string, string> {
  const values = Object.fromEntries(ECHOED.flatMap((key) => (typeof form[key] === "string" ? [[key, form[key] as string]] : [])));
  // The same key goes back into the re-rendered form, so a corrected resubmit stays one order (S-014 AC4).
  const key = Uuid.safeParse(form.idempotencyKey);
  return key.success ? { ...values, idempotencyKey: key.data } : values;
}

/** Form field name -> its message key (dots are key separators in the catalogue). */
const fieldMessageKey = (field: string) => `checkout.errors.${field.replace(/\.(\w)/g, (_, c: string) => c.toUpperCase())}`;

/**
 * `basketHasLines`: a `basket` refusal for a basket with lines means nothing in it can be
 * ordered (UX audit H2), not that it is empty.
 */
function fieldMessages(fields: string[], locale: Locale, basketHasLines: boolean): Record<string, string> {
  const known = new Set(["basket", "fulfilment", "address", "landmark", "date", "windowId", "contact.name", "contact.phone", "contact.email", "contact.note", "acceptPolicies"]);
  const keyFor = (f: string) => (f === "basket" && basketHasLines ? "checkout.errors.nothingOrderable" : fieldMessageKey(f));
  return Object.fromEntries(fields.map((f) => (known.has(f) ? [f, translate(keyFor(f), locale)] : ["form", translate("checkout.errors.form", locale)])));
}

function refusal(result: Exclude<PlaceOrderResult, { ok: true }>, values: Record<string, string>, locale: Locale, basketHasLines: boolean) {
  switch (result.code) {
    case "VALIDATION_FAILED":
      if ("keyReused" in result) {
        // Another submitter's key (G-21): reveal nothing, and the re-rendered form gets a fresh key.
        const fields = { form: translate("checkout.errors.resubmit", locale) };
        return actionError(result.code, locale, { fields, extra: { values: { ...values, idempotencyKey: crypto.randomUUID() } } });
      }
      return actionError(result.code, locale, { fields: fieldMessages(result.fields, locale, basketHasLines), extra: { values } });
    case "DATE_UNAVAILABLE":
      return actionError(result.code, locale, { fields: { date: translate("checkout.errors.dateTooSoon", locale) }, extra: { values, reason: result.reason } });
    case "PRICE_CHANGED": {
      const { lines, itemsTotalRs, deliveryFeeRs, totalRs } = result;
      return actionError(result.code, locale, { extra: { values, lines, itemsTotalRs, deliveryFeeRs, totalRs } });
    }
  }
}

async function submitOrder(form: Record<string, unknown>, args: Route.ActionArgs, locale: Locale) {
  const { request, context } = args;
  const basket = readBasket(request);
  const result = await timed(context, "place-order", () => placeOrder(form, {
    db: context.get(requestDbContext).db,
    now: context.get(clockContext).now(),
    locale,
    basket,
  }));
  if (!result.ok) return refusal(result, echo(form), locale, basket.length > 0);
  // The order's own locale: a replay from either language returns the original redirect (S-014 AC2).
  const confirmation = localePath(result.locale, `/order/${result.trackingToken}/confirmed`);
  const headers = new Headers({ "Set-Cookie": clearBasketCookie() });
  // Lines left out are named on the confirmation page (UX audit H1): ids in a cookie for that order's pages only
  // (Path=/order/:token so the client data request `confirmed.data` gets it too).
  const orderPath = localePath(result.locale, `/order/${result.trackingToken}`);
  if (result.leftOut.length > 0) headers.append("Set-Cookie", leftOutCookie(result.leftOut, orderPath));
  // AC48: the confirmation renders from this signed cookie, without a second database connection.
  // A replay sets none: the first answer's cookie (with its left-out names) stays, or the page reads the database.
  const signer = context.get(confirmationContext);
  if (signer && !result.replayed) {
    const snapshot = { number: result.orderNumber, locale: result.locale, leftOut: result.leftOutNames.map((name) => localized(name, result.locale)) };
    headers.append("Set-Cookie", await signer.cookie(result.trackingToken, snapshot, orderPath, context.get(clockContext).now()));
  }
  return redirect(confirmation, { headers });
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

/** The page title from the root's messages (the client loader has no translator). */
export function meta({ matches }: MetaArgs) {
  const root = matches.find((m) => m?.id === "root")?.loaderData as { messages?: { basket?: { metaTitle?: string } } } | undefined;
  return [{ title: `${root?.messages?.basket?.metaTitle ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex" }];
}

type LoaderData = Route.ComponentProps["loaderData"];
type ActionData = Route.ComponentProps["actionData"];
type T = (key: string, values?: Record<string, string | number>) => string;

interface BasketModel {
  menu: Menu;
  lines: PricedLine[];
  views: BasketLineView[];
  itemsTotalRs: number;
  orderable: PricedLine[];
  /** Lines that will not be ordered, named for the summary's "not included" rows (UX audit H1). */
  leftOut: { lineId: string; name: string }[];
}

/**
 * Lines priced from the newest menu copy (the loader's or the browser cache's), with the
 * calm notes of ADR-0004: a changed price says "Price updated from Rs X to Rs Y"; a sold
 * out, hidden or deleted product is "No longer available" and is left out of the total.
 */
function useBasketModel(data: LoaderData, t: T, locale: Locale): BasketModel {
  const cached = useMenuState();
  // The loader's copy seeds the cache (and, when newer, produces the notes).
  useEffect(() => menuStore.offer(data.menu), [data.menu]);
  // Hidden products the server named: the header count leaves them out too (UX audit M1).
  useEffect(() => menuStore.rememberGone(data.goneNames), [data.goneNames]);
  const menu = fresherEntry(cached.entry, data.menu).data;
  const basket = useBasketLines(data.basket);
  const lines = priceBasket(basket, menu);
  const products = new Map(menu.products.map((p) => [p.id, p]));
  const views = lines.map((line): BasketLineView => {
    const product = products.get(line.productId);
    const goneName = data.goneNames[line.productId] ?? cached.goneNames.get(line.productId);
    const name = product?.name ?? goneName;
    const note = cached.notes.get(line.productId);
    return {
      lineId: line.lineId,
      name: name ? localized(name, locale) : t("basket.unavailableItem"),
      imageUrl: product?.photos[0]?.url ?? null,
      quantity: line.quantity,
      unitPrice: formatRupees(line.unitPriceRs),
      lineTotal: formatRupees(line.lineTotalRs),
      unavailable: line.problem !== null,
      nameUnknown: !name,
      priceNote: note ? t("basket.priceUpdated", { old: formatRupees(note.fromRs), new: formatRupees(note.toRs) }) : null,
    };
  });
  const orderable = lines.filter((l) => l.problem === null);
  const leftOut = views.filter((v) => v.unavailable).map((v) => ({ lineId: v.lineId, name: v.name }));
  return { menu, lines, views, itemsTotalRs: checkoutTotals(lines, null, menu.checkout.deliveryFeeRs).itemsTotalRs, orderable, leftOut };
}

/**
 * No checkout: "Your basket is empty." with no lines, or, when lines exist but none can be
 * ordered, "Nothing in your basket can be ordered right now." (UX audit H2). Either way the
 * next step is "See the menu".
 */
function NoCheckout({ hasLines }: { hasLines: boolean }) {
  const { t, locale } = useI18n();
  return (
    <>
      <p className="mt-6 max-w-measure text-lg">{t(hasLines ? "basket.nothingOrderable" : "basket.empty")}</p>
      <p className="mt-4">
        {/* "See the menu" goes home until the menu page exists (E-04). */}
        <a href={localePath(locale, "/")} className="inline-flex min-h-11 items-center font-semibold link">
          {t("basket.seeMenu")}
        </a>
      </p>
    </>
  );
}

/** "1 item is no longer available", said once when a background refresh flips lines (UX audit M2). */
function UnavailableAnnouncement({ count }: { count: number }) {
  const { t } = useI18n();
  return (
    <p role="status" className="sr-only">
      {count > 0 ? t("basket.unavailableCount", { count }) : ""}
    </p>
  );
}

/**
 * After Remove (with JavaScript): "Removed from your basket: {name}." with Undo, which puts
 * the same line back where it was (UX audit M3). It stays until Undo or the next Remove: no
 * timer, so keyboard and screen-reader users have the time they need.
 */
function RemovedNote({ removed, restored, onUndo }: { removed: RemovedLine | null; restored: string | null; onUndo: () => void }) {
  const { t } = useI18n();
  return (
    <div role="status" className="mt-4 empty:hidden">
      {removed && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>{t("basket.removed", { name: removed.name })}</span>
          <Button type="button" variant="outline" size="sm" onClick={onUndo} aria-label={t("basket.undoRemove", { name: removed.name })}>
            <Undo2 aria-hidden="true" />
            {t("basket.undo")}
          </Button>
        </p>
      )}
      {restored && <p>{t("basket.restored", { name: restored })}</p>}
    </div>
  );
}

function useUndoRemove() {
  const [removed, setRemoved] = useState<RemovedLine | null>(null);
  const [restored, setRestored] = useState<string | null>(null);
  const onRemoved = (line: RemovedLine) => {
    setRestored(null);
    setRemoved(line);
  };
  const onUndo = () => {
    if (!removed) return;
    try {
      basketStore.restore(removed.line, removed.index);
      setRestored(removed.name);
    } catch {
      // A full basket (another tab filled it): nothing to put back.
    }
    setRemoved(null);
    requestAnimationFrame(() => document.getElementById("basket-heading")?.focus());
  };
  return { removed, restored, onRemoved, onUndo };
}

interface BasketSectionProps {
  lines: BasketLineView[];
  itemsTotalRs: number;
  showSubtotal: boolean;
  lineError?: string;
  onRemoved: (removed: RemovedLine) => void;
}

function BasketSection({ lines, itemsTotalRs, showSubtotal, lineError, onRemoved }: BasketSectionProps) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="basket-heading" className="mt-8">
      <h2 id="basket-heading" tabIndex={-1} className="text-h2 outline-none">
        {t("checkout.sections.basket")}
      </h2>
      {lineError && (
        <p role="alert" className="mt-3 font-semibold text-destructive">
          {lineError}
        </p>
      )}
      <ul className="mt-2">
        {lines.map((line) => (
          <BasketLineItem key={line.lineId} line={line} onRemoved={onRemoved} />
        ))}
      </ul>
      {/* No "Subtotal Rs 0" when nothing can be ordered (UX audit H2). */}
      {showSubtotal && (
        <p className="mt-2 flex flex-wrap justify-between gap-x-4 text-lg font-semibold">
          <span>{t("basket.subtotal")}</span>
          <span className="whitespace-nowrap">{formatRupees(itemsTotalRs)}</span>
        </p>
      )}
    </section>
  );
}

/** A refused placeOrder as the view reads it (the error envelope plus echoed values). */
interface OrderRefusal extends ActionErrorBody {
  values: Record<string, string>;
  totalRs?: number;
  deliveryFeeRs?: number;
  lines?: (Pick<PricedLine, "productId" | "unitPriceRs" | "problem"> & { name?: PricedLine["name"] })[];
}

/** Refusal of placeOrder (has `values`) vs. a basket line refusal. */
function orderRefusal(actionData: ActionData): OrderRefusal | undefined {
  return actionData && !actionData.ok && "values" in actionData ? (actionData as unknown as OrderRefusal) : undefined;
}

function useFocusOnRefusal(refused: OrderRefusal | undefined) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // PRICE_CHANGED is calm (ADR-0004): no summary, focus stays on the button.
    if (refused && refused.error.code !== "PRICE_CHANGED") ref.current?.focus();
  }, [refused]);
  return ref;
}

/**
 * PRICE_CHANGED with JavaScript (rare now): the refusal's server prices go into the menu at
 * once, so lines get their notes and totals are current, then the menu is revalidated.
 */
function useRefusalPrices(refused: OrderRefusal | undefined, current: MenuEntry) {
  useEffect(() => {
    // Nothing orderable at submit (UX audit H2): fetch the menu so the page shows why.
    if (refused?.error.fields?.basket) void menuStore.revalidate({ force: true });
    if (refused?.error.code !== "PRICE_CHANGED" || !refused.lines) return;
    const fee = refused.values.fulfilment === "delivery" ? refused.deliveryFeeRs : undefined;
    menuStore.replace(menuWithServerPrices(current, refused.lines, fee));
    void menuStore.revalidate({ force: true });
    // Only a new refusal patches the menu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refused]);
}

interface RefusalNote {
  leftOut?: string;
  total?: string;
}

/**
 * A PRICE_CHANGED refusal explained (UX audit H1.2, M4): which items were left out (by
 * name) and the total change from what the customer was shown. The view adds "Your order
 * has not been sent yet".
 */
function refusalNote(refused: OrderRefusal | undefined, t: T, locale: Locale): RefusalNote | undefined {
  if (refused?.error.code !== "PRICE_CHANGED" || refused.totalRs === undefined) return undefined;
  const shown = Number(refused.values.displayedTotalRs ?? refused.values[`displayedTotalRs.${refused.values.fulfilment}`]);
  const names = leftOutNames(refused.lines ?? [], locale);
  const leftOut = names.length > 0 ? t("checkout.leftOutRefusal", { count: names.length, names: nameList(names, locale) }) : undefined;
  const changed = Number.isFinite(shown) && shown !== refused.totalRs;
  // A no-break space keeps "Rs" with its number in running text (design-system Price).
  const rs = (amount: number) => formatRupees(amount).replace(" ", "\u00a0");
  const total = changed ? t("checkout.totalChanged", { old: rs(shown), new: rs(refused.totalRs) }) : undefined;
  return leftOut || total ? { leftOut, total } : undefined;
}

/**
 * The refusal note, next to the sticky Place order bar: an info Alert in an always-mounted
 * polite status region, scrolled into view without moving focus off the button.
 */
function RefusalNoteAlert({ note }: { note: RefusalNote | undefined }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (note) ref.current?.scrollIntoView({ block: "nearest" });
  }, [note]);
  return (
    <div role="status" ref={ref} className="mt-4 scroll-mb-28">
      {note && (
        <Alert tone="info" title={t("checkout.notSentTitle")}>
          {note.leftOut && <p>{note.leftOut}</p>}
          {note.total && <p>{note.total}</p>}
        </Alert>
      )}
    </div>
  );
}

function CheckoutForm({ data, model, refused }: { data: LoaderData; model: BasketModel; refused: OrderRefusal | undefined }) {
  const { t, locale } = useI18n();
  const navigation = useNavigation();
  const values = refused?.values ?? {};
  const initialChoice = values.fulfilment === "delivery" || values.fulfilment === "pickup" ? values.fulfilment : null;
  const [fulfilment, setFulfilment] = useState<FulfilmentChoice | null>(initialChoice);
  const summaryRef = useFocusOnRefusal(refused);
  const errors = refused?.error.fields ?? {};
  const { checkout } = model.menu;
  const { itemsTotalRs } = model;
  const totalRs = itemsTotalRs + deliveryFeeFor(fulfilment, checkout.deliveryFeeRs);
  // Busy from the tap until the confirmation page has loaded (the redirect's loading phase too).
  const submitting = isPendingIntent(navigation, "placeOrder");
  const priceChanged = refused?.error.code === "PRICE_CHANGED";
  const label = priceChanged ? t("checkout.placeOrderAt", { total: formatRupees(totalRs) }) : t("checkout.placeOrder");
  const items = model.orderable.map((l) => ({ lineId: l.lineId, name: localized(l.name, locale), quantity: l.quantity, lineTotalRs: l.lineTotalRs }));
  // Memoised on the refusal so the note scrolls into view once, not on every render.
  const note = useMemo(() => refusalNote(refused, t, locale), [refused, t, locale]);
  return (
    <Form method="post" noValidate className="checkout-form">
      {refused && !priceChanged && <ErrorSummary ref={summaryRef} message={refused.error.message} fields={refused.error.fields} />}
      {/* A refusal keeps the posted key; a new render after an order was created gets a fresh one (S-014 AC4). */}
      <input type="hidden" name="idempotencyKey" value={values.idempotencyKey ?? data.idempotencyKey} />
      {/* One total per choice so the first submit matches even without JavaScript (the server reads the chosen one). */}
      <input type="hidden" name="displayedTotalRs.delivery" value={itemsTotalRs + deliveryFeeFor("delivery", checkout.deliveryFeeRs)} />
      <input type="hidden" name="displayedTotalRs.pickup" value={itemsTotalRs} />
      <FulfilmentSection deliveryFee={formatRupees(checkout.deliveryFeeRs)} pickupAddress={checkout.pickup.address} pickupMapUrl={checkout.pickup.mapUrl} initial={values} errors={errors} onChoose={setFulfilment} />
      <DateSection today={data.today} todayLabel={formatDayLabel(data.today, locale)} initial={values.date} error={errors.date} />
      <TimeSection windows={checkout.windows} initial={values} error={errors.windowId} />
      <DetailsSection initial={values} errors={errors} />
      <SummarySection
        items={items}
        leftOut={model.leftOut}
        itemsTotalRs={itemsTotalRs}
        deliveryFeeRs={checkout.deliveryFeeRs}
        juiceNumber={checkout.payment.juiceNumber}
        policies={checkout.policies ? localized(checkout.policies, locale) : t("checkout.policiesDefault")}
        errors={errors}
        initialAccepted={values.acceptPolicies === "on"}
      />
      <RefusalNoteAlert note={note} />
      <PlaceOrderBar itemsTotalRs={itemsTotalRs} deliveryFeeRs={checkout.deliveryFeeRs} label={label} submitting={submitting} />
    </Form>
  );
}

export default function Basket({ loaderData, actionData }: Route.ComponentProps) {
  const { t, locale } = useI18n();
  const model = useBasketModel(loaderData, t, locale);
  const refused = orderRefusal(actionData);
  useRefusalPrices(refused, fresherEntry(menuStore.state().entry, loaderData.menu));
  const lineError = actionData && !actionData.ok && !refused ? actionData.error.message : undefined;
  const undo = useUndoRemove();
  const hasLines = model.views.length > 0;
  const canOrder = model.orderable.length > 0;
  return (
    <>
      <h1>{t("basket.metaTitle")}</h1>
      <RemovedNote removed={undo.removed} restored={undo.restored} onUndo={undo.onUndo} />
      <UnavailableAnnouncement count={model.leftOut.length} />
      {hasLines && <BasketSection lines={model.views} itemsTotalRs={model.itemsTotalRs} showSubtotal={canOrder} lineError={lineError} onRemoved={undo.onRemoved} />}
      {/* Checkout needs something orderable; otherwise the empty or nothing-orderable message. */}
      {canOrder ? <CheckoutForm data={loaderData} model={model} refused={refused} /> : <NoCheckout hasLines={hasLines} />}
    </>
  );
}
