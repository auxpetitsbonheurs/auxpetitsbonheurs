import { Suspense, lazy } from "react";
import { type ShouldRevalidateFunctionArgs, data, isRouteErrorResponse, redirect } from "react-router";
import { SoldOutArea } from "~/components/product/sold-out";
import { issueFields } from "~/components/product/selection-messages";
import { NotFoundContent } from "~/components/shell/not-found-content";
import { ProductArticle, type ProductData, productView } from "~/components/site/product-article";
import { addLine, basketItemCount } from "~/domain/basket";
import { DomainError } from "~/domain/errors";
import { fromPriceRs } from "~/domain/option-prices";
import { type LineInput, canonicalLine, productProblem, validateSelection } from "~/domain/pricing";
import { todayMU } from "~/domain/time";
import { t as translate } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import { formatRupees, localeFromPathname, localePath } from "~/lib/locale";
import { actionError, domainErrorResult } from "~/server/action-result.server";
import { basketCookie, newLineId, readBasket } from "~/server/basket.server";
import { clockContext } from "~/server/clock.server";
import { AddToBasketInput, addToBasketFields } from "~/server/contracts/site";
import { requestDbContext } from "~/server/db.server";
import { publicConfigContext } from "~/server/public-config.server";
import { findOrderableProduct, findProductPageBySlug, findRenamedSlug } from "~/server/repos/catalogue.server";
import { getSiteSettings } from "~/server/repos/settings.server";
import { earliestDate } from "~/domain/availability";
import { PRODUCT_GONE, ProductGone, ProductDetails } from "~/components/site/product-details";
import { customerProduct } from "~/server/product-view.server";
import { timed } from "~/server/server-timing.server";
import type { Route } from "./+types/product";

export const RENAMED_CACHE_CONTROL = "public, max-age=3600";

/**
 * An old slug (S-050, owner Q19): 301 to the current page in the same language. The Location
 * is built from the stored slug only (never from the request), so it is always this site.
 */
async function redirectRenamed(context: Route.LoaderArgs["context"], url: URL, slug: string): Promise<never> {
  const current = await timed(context, "slug", () => findRenamedSlug(context.get(requestDbContext).db, slug));
  if (!current) throw data(null, { status: 404 });
  // An hour, not forever: a product may take an old slug back (AC6), and a browser holding a
  // permanent 301 from it would then loop.
  throw redirect(localePath(localeFromPathname(url.pathname), `/menu/${encodeURIComponent(current)}`), {
    status: 301,
    headers: { "Cache-Control": RENAMED_CACHE_CONTROL },
  });
}

/**
 * `site/product` loader (contracts.md). Hidden, or seasonal outside its window on today's
 * Mauritius date: 404 "no longer available" with no product data (S-065 AC5). `earliestDate` is
 * what the checkout date picker would offer first for this product alone (AC3), or null.
 */
export async function loader({ params, context, url }: Route.LoaderArgs) {
  const db = context.get(requestDbContext).db;
  const [found, settings] = await Promise.all([
    timed(context, "product", () => findProductPageBySlug(db, params.slug)),
    timed(context, "settings", () => getSiteSettings(db)),
    // The server renders the ordering area in the HTML (works without JavaScript): see ProductOrderForm.
    loadOrderForm(),
  ]);
  if (!found) return redirectRenamed(context, url, params.slug);
  const { record, availability } = found;
  const today = todayMU(context.get(clockContext).now());
  const problem = productProblem({ ...record, season: availability.season }, today);
  if (problem === "hidden" || problem === "out_of_season") throw data(PRODUCT_GONE, { status: 404 });
  return {
    // S-066: the option groups for the ordering area; S-067: the Settings message limit.
    product: { ...customerProduct(record, context.get(publicConfigContext).supabaseUrl), optionGroups: record.optionGroups },
    cakeMessageMax: settings.cakeMessageMax,
    // The date picker's own rules (domain/availability), for this product alone: the page and the
    // picker never disagree (its notice, its season, closed and blocked days, the 90-day horizon).
    earliestDate: earliestDate({ today, ...settings.availability }, availability.noticeDays ?? settings.availability.defaultNoticeDays, availability.season ? [availability.season] : []),
    seasonEndsOn: availability.season?.endsOn ?? null,
  };
}

export type { ProductData };
export { productView };

/**
 * The no-JavaScript refusal with a message per field (VALIDATION_FAILED, every issue) and the
 * customer's own choices echoed back, so the re-rendered page keeps them (ids and their text only).
 */
function validationRefusal(fields: Record<string, string>, locale: ReturnType<typeof localeFromPathname>, selection?: Omit<LineInput, "productId">) {
  return actionError("VALIDATION_FAILED", locale, { fields: { form: translate("productOptions.errors.form", locale), ...fields }, extra: { selection: selection ?? null } });
}

/**
 * `addToBasket` (contracts.md): parses the posted choices (never a price), re-reads the
 * product with its option groups, checks availability (today, Mauritius) and the selection
 * with domain/pricing (every issue as `fields`), then merges the line into the basket. A
 * plain form post (no JavaScript yet) redirects to the basket; the enhanced form sends
 * `respond=inline` and gets `{ ok, basketCount }`, so the page stays and confirms inline.
 */
export async function action({ request, url, context }: Route.ActionArgs) {
  const locale = localeFromPathname(url.pathname);
  const form = await request.formData();
  const parsed = AddToBasketInput.safeParse(addToBasketFields(form));
  if (!parsed.success) {
    const quantity = parsed.error.issues.some((i) => i.path[0] === "quantity");
    return quantity ? validationRefusal({ quantity: translate("productOptions.errors.quantity", locale) }, locale) : actionError("VALIDATION_FAILED", locale);
  }
  const { intent: _intent, ...line } = parsed.data;
  const db = context.get(requestDbContext).db;
  const [found, settings] = await Promise.all([timed(context, "product", () => findOrderableProduct(db, line.productId)), getSiteSettings(db)]);
  if (!found || productProblem(found, todayMU(context.get(clockContext).now())) !== null) return actionError("PRODUCT_UNAVAILABLE", locale);
  const issues = validateSelection(found, line, { cakeMessageMax: settings.cakeMessageMax });
  if (issues.length > 0) {
    const t = (key: string, values?: Record<string, string | number>) => translate(key, locale, values);
    const { productId: _id, ...selection } = line;
    return validationRefusal(issueFields(issues, found.optionGroups, t, locale), locale, selection);
  }
  try {
    const lines = addLine(readBasket(request), canonicalLine(found, line), newLineId);
    const headers = { "Set-Cookie": basketCookie(lines) };
    if (form.get("respond") === "inline") return data({ ok: true as const, basketCount: basketItemCount(lines) }, { headers });
    return redirect(localePath(locale, "/basket"), { headers });
  } catch (error) {
    if (error instanceof DomainError) return domainErrorResult(error, locale);
    throw error;
  }
}

/**
 * After an inline add only the header count changes: the layout reloads (cookie only,
 * Settings cached), the product does not (one database round trip saved).
 */
export function shouldRevalidate({ formData, actionResult, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  const added = formData?.get("intent") === "addToBasket" && (actionResult as { ok?: unknown } | undefined)?.ok === true;
  return added ? false : defaultShouldRevalidate;
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ name: "robots", content: "noindex" }];
  return [{ title: `${loaderData.product.name.en} | Aux petits bonheurs` }];
}

/**
 * The ordering area (pickers, live price, Add) is its own chunk, so the page's first JS stays
 * inside its budget. The server renders it in the HTML (a working form before hydration and
 * without JavaScript); the browser starts loading it as soon as this module runs.
 */
type OrderFormModule = typeof import("~/components/product/order-form");
let orderForm: OrderFormModule | null = null;
let orderFormLoading: Promise<OrderFormModule> | null = null;
const loadOrderForm = () => (orderFormLoading ??= import("~/components/product/order-form").then(
  (m) => (orderForm = m),
  (error: unknown) => {
    orderFormLoading = null; // a failed chunk load may be retried
    throw error;
  },
));
type OrderFormExport = { default: OrderFormModule["ProductOrderForm"] };
/**
 * Once the chunk is loaded (always on the server: the loader waits for it) `lazy` gets an
 * already-settled thenable and renders at once, so the HTML holds the form itself, not a
 * streamed Suspense fallback that a browser without JavaScript would never swap in.
 */
const ProductOrderForm = lazy((): Promise<OrderFormExport> => {
  if (!orderForm) return loadOrderForm().then((m) => ({ default: m.ProductOrderForm }));
  const exported = { default: orderForm.ProductOrderForm };
  // React only calls `then` and reads the result as settled when the callback runs at once;
  // the types ask for a full Promise.
  const settled: PromiseLike<OrderFormExport> = { then: (resolve) => Promise.resolve(resolve?.(exported)) as never };
  return settled as Promise<OrderFormExport>;
});
if (typeof window !== "undefined") void loadOrderForm();
/** For tests: what the loader does before the server renders the page. */
export const preloadOrderForm = loadOrderForm;

/** Cakes take a message on the cake unless the product has its own text option. */
const takesMessage = (product: { type: string; optionGroups: { kind: string }[] }) => product.type === "cake" && !product.optionGroups.some((g) => g.kind === "text");

export default function Product({ loaderData, actionData }: Route.ComponentProps) {
  const { t, locale } = useI18n();
  const { product, cakeMessageMax } = loaderData;
  const shown = productView(product, locale);
  // With options the heading price is the cheapest configuration ("From Rs X"); the live price is in the ordering area.
  const heading = product.optionGroups.length > 0 ? { ...shown, price: t("productOptions.fromPrice", { price: formatRupees(fromPriceRs(product)) }) } : shown;
  const refusal = actionData && !actionData.ok ? { message: actionData.error.message, fields: actionData.error.fields, selection: (actionData as { selection?: Omit<LineInput, "productId"> | null }).selection ?? undefined } : undefined;
  return (
    <ProductArticle shown={heading} details={<ProductDetails allergens={product.allergens} earliestDate={loaderData.earliestDate} seasonEndsOn={loaderData.seasonEndsOn} />}>
      {shown.addable ? (
        // Remount per product so choices and a confirmation never carry over to another cake.
        <Suspense fallback={null}>
          <ProductOrderForm key={product.id} product={product} cakeMessageMax={cakeMessageMax} takesMessage={takesMessage(product)} refusal={refusal} />
        </Suspense>
      ) : (
        <SoldOutArea name={shown.name} refusal={actionData && !actionData.ok ? actionData.error.message : undefined} />
      )}
    </ProductArticle>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const { t } = useI18n();
  // Hidden or out of season (S-065 AC5): "no longer available" with the menu; unknown (AC6): 404 with Home and WhatsApp.
  if (isRouteErrorResponse(error) && error.status === 404) return <ProductGone gone={error.data === PRODUCT_GONE} fallback={<NotFoundContent />} />;
  return (
    <>
      <h1>{t("errors.genericTitle")}</h1>
      <p className="mt-4">{t("errors.genericBody")}</p>
    </>
  );
}
