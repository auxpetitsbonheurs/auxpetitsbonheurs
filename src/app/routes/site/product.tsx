import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link, type ShouldRevalidateFunctionArgs, data, isRouteErrorResponse, redirect, useFetcher } from "react-router";
import { NotFoundContent } from "~/components/shell/not-found-content";
import { ProductArticle, type ProductData, productView } from "~/components/site/product-article";
import { Alert } from "~/components/ui/alert";
import { SubmitButton } from "~/components/ui/submit-button";
import { addLine, basketItemCount } from "~/domain/basket";
import { DomainError } from "~/domain/errors";
import { productProblem } from "~/domain/pricing";
import { useI18n } from "~/i18n/react";
import { basketStore } from "~/lib/basket-store";
import { localeFromPathname, localePath } from "~/lib/locale";
import { actionError, domainErrorResult } from "~/server/action-result.server";
import { basketCookie, newLineId, readBasket } from "~/server/basket.server";
import { AddToBasketInput } from "~/server/contracts/site";
import { requestDbContext } from "~/server/db.server";
import { publicConfigContext } from "~/server/public-config.server";
import { findProductPageBySlug, findProductsByIds, findRenamedSlug } from "~/server/repos/catalogue.server";
import { getSiteSettings } from "~/server/repos/settings.server";
import { clockContext } from "~/server/clock.server";
import { earliestDate } from "~/domain/availability";
import { isInSeason } from "~/domain/season";
import { todayMU } from "~/domain/time";
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
  ]);
  if (!found) return redirectRenamed(context, url, params.slug);
  const { record, availability } = found;
  const today = todayMU(context.get(clockContext).now());
  if (productProblem(record) === "hidden" || !isInSeason(availability.season, today)) throw data(PRODUCT_GONE, { status: 404 });
  return {
    product: customerProduct(record, context.get(publicConfigContext).supabaseUrl),
    // The date picker's own rules (domain/availability), for this product alone: the page and the
    // picker never disagree (its notice, its season, closed and blocked days, the 90-day horizon).
    earliestDate: earliestDate({ today, ...settings.availability }, availability.noticeDays ?? settings.availability.defaultNoticeDays, availability.season ? [availability.season] : []),
    seasonEndsOn: availability.season?.endsOn ?? null,
  };
}

export type { ProductData };
export { productView };

/**
 * `addToBasket` (contracts.md): re-checks the product server-side and merges the line. A
 * plain form post (no JavaScript yet) redirects to the basket; the enhanced form sends
 * `respond=inline` and gets `{ ok, basketCount }`, so the page stays and confirms inline
 * (catalogue spec Flow: "redirect /basket without JS; toast + count bump with JS").
 */
export async function action({ request, url, context }: Route.ActionArgs) {
  const locale = localeFromPathname(url.pathname);
  const form = Object.fromEntries(await request.formData());
  const parsed = AddToBasketInput.safeParse(form);
  if (!parsed.success) return actionError("VALIDATION_FAILED", locale);
  const { intent: _intent, ...line } = parsed.data;
  const found = await timed(context, "product", async () => (await findProductsByIds(context.get(requestDbContext).db, [line.productId])).get(line.productId));
  if (productProblem(found) !== null) return actionError("PRODUCT_UNAVAILABLE", locale);
  try {
    const lines = addLine(readBasket(request), line, newLineId);
    const headers = { "Set-Cookie": basketCookie(lines) };
    if (form.respond === "inline") return data({ ok: true as const, basketCount: basketItemCount(lines) }, { headers });
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

export default function Product({ loaderData, actionData }: Route.ComponentProps) {
  const { t, locale } = useI18n();
  const shown = productView(loaderData.product, locale);
  return (
    <ProductArticle shown={shown} details={<ProductDetails allergens={loaderData.product.allergens} earliestDate={loaderData.earliestDate} seasonEndsOn={loaderData.seasonEndsOn} />}>
        {shown.addable ? (
          // Remount per product so a confirmation never carries over to another cake.
          <AddToBasketForm key={loaderData.product.id} productId={loaderData.product.id} refusal={actionData && !actionData.ok ? actionData.error.message : undefined} />
        ) : (
          <div className="mt-6">
            {actionData && !actionData.ok && (
              <Alert tone="danger" role="alert" className="mb-6">
                <p>{actionData.error.message}</p>
              </Alert>
            )}
            <p className="inline-flex rounded-full border-2 border-foreground px-3 py-1 font-semibold">{t("product.soldOut")}</p>
            <p className="mt-3 max-w-measure">{t("product.soldOutHint")}</p>
          </div>
        )}
    </ProductArticle>
  );
}

/** Taps closer together than this add once (a double tap is one add). */
const DOUBLE_TAP_MS = 800;

/**
 * Add to basket (S-011 AC4, ADR-0004). Before hydration it is a plain form post (the server
 * redirects to the basket). Once hydrated the line is added in the browser with no network
 * call: the basket cookie is written, the header count updates through the store, and "Added
 * to your basket" is announced with a link to the basket. A double tap adds once. When the
 * cookie cannot be written from script (an old HttpOnly cookie, cookies blocked) it falls
 * back to the server post through a fetcher ("Adding…" until the answer).
 */
function AddToBasketForm({ productId, refusal }: { productId: string; refusal?: string }) {
  const { t, locale } = useI18n();
  const fetcher = useFetcher<typeof action>();
  const inFlight = useRef(false);
  const lastTap = useRef(-Infinity);
  const [added, setAdded] = useState(0);
  const [inBasket, setInBasket] = useState(1);
  const [localError, setLocalError] = useState<string>();
  const busy = fetcher.state !== "idle";
  const result = fetcher.data;
  const serverAdded = fetcher.state !== "submitting" && result?.ok === true;
  const error = localError ?? (result && !result.ok ? result.error.message : refusal);
  useEffect(() => {
    if (serverAdded) basketStore.refresh();
  }, [serverAdded]);
  const postToServer = (form: FormData) => {
    inFlight.current = true;
    form.set("respond", "inline");
    void fetcher.submit(form, { method: "post" }).finally(() => {
      inFlight.current = false;
    });
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const now = performance.now();
    if (inFlight.current || busy || now - lastTap.current < DOUBLE_TAP_MS) return;
    lastTap.current = now;
    try {
      const lines = basketStore.add({ productId, options: [], quantity: 1 });
      setLocalError(undefined);
      // "(2 in basket)" so a deliberate second tap visibly counts (UX audit M6).
      setInBasket(lines.filter((l) => l.productId === productId).reduce((sum, l) => sum + l.quantity, 0));
      setAdded((n) => n + 1);
    } catch (problem) {
      if (problem instanceof DomainError) {
        setAdded(0);
        setLocalError(t(`errors.codes.${problem.code}`));
        return;
      }
      postToServer(new FormData(event.currentTarget));
    }
  };
  return (
    <>
      {error && (
        <Alert tone="danger" role="alert" className="mt-6">
          <p>{error}</p>
        </Alert>
      )}
      <form method="post" onSubmit={submit} className="mt-6">
        <input type="hidden" name="intent" value="addToBasket" />
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="quantity" value="1" />
        <SubmitButton size="lg" pending={fetcher.state === "submitting"} pendingText={t("product.adding")} pendingLabel={t("product.adding")}>
          {t("product.addToBasket")}
        </SubmitButton>
      </form>
      <div role="status">
        {(added > 0 || serverAdded) && !error && (
          <Alert key={added} tone="success" title={t("product.addedCount", { count: serverAdded ? 1 : inBasket })} className="mt-4">
            <Link to={localePath(locale, "/basket")} prefetch="render" className="mt-1 inline-flex min-h-11 items-center font-semibold link">
              {t("product.viewBasket")}
            </Link>
          </Alert>
        )}
      </div>
    </>
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
