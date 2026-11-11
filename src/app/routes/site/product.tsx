import { type FormEvent, useRef } from "react";
import { Link, type ShouldRevalidateFunctionArgs, data, isRouteErrorResponse, redirect, useFetcher } from "react-router";
import { NotFoundContent } from "~/components/shell/not-found-content";
import { Alert } from "~/components/ui/alert";
import { SubmitButton } from "~/components/ui/submit-button";
import { addLine, basketItemCount } from "~/domain/basket";
import { DomainError } from "~/domain/errors";
import { productProblem } from "~/domain/pricing";
import { localized } from "~/i18n/localized";
import { useI18n } from "~/i18n/react";
import { publicImageUrl } from "~/lib/images";
import { type Locale, formatRupees, localeFromPathname, localePath } from "~/lib/locale";
import { actionError, domainErrorResult } from "~/server/action-result.server";
import { basketCookie, newLineId, readBasket } from "~/server/basket.server";
import { AddToBasketInput } from "~/server/contracts/site";
import { requestDbContext } from "~/server/db.server";
import { publicConfigContext } from "~/server/public-config.server";
import { findProductBySlug, findProductsByIds } from "~/server/repos/catalogue.server";
import { timed } from "~/server/server-timing.server";
import type { Route } from "./+types/product";

/** `site/product` loader (contracts.md, minimal slice: no options, notice date or promotion). */
export async function loader({ params, context }: Route.LoaderArgs) {
  const record = await timed(context, "product", () => findProductBySlug(context.get(requestDbContext).db, params.slug));
  if (!record || productProblem(record) === "hidden") throw data(null, { status: 404 });
  const { supabaseUrl } = context.get(publicConfigContext);
  return {
    product: {
      id: record.id,
      slug: record.slug,
      type: record.type,
      name: record.name,
      description: record.description,
      allergens: record.allergens,
      photos: record.photos.map((p) => ({ url: publicImageUrl(p.storagePath, supabaseUrl), width: p.width, height: p.height })),
      status: record.status === "sold_out" ? ("sold_out" as const) : ("available" as const),
      minQuantity: record.minQuantity,
      basePriceRs: record.basePriceRs,
    },
  };
}

export type ProductData = Awaited<ReturnType<typeof loader>>["product"];

/** What the page shows in `locale`: names fall back to English (NFR-007); alt = name (NFR-002). */
export function productView(product: ProductData, locale: Locale) {
  const name = localized(product.name, locale);
  return {
    name,
    description: product.description ? localized(product.description, locale) : null,
    price: formatRupees(product.basePriceRs, locale),
    addable: product.status === "available",
    photos: product.photos.map((photo) => ({ ...photo, alt: name })),
  };
}

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
  const photo = shown.photos[0];
  return (
    <article className="grid gap-6 md:grid-cols-2 md:gap-10">
      {photo && (
        <img
          src={photo.url}
          alt={photo.alt}
          width={photo.width}
          height={photo.height}
          className="h-auto w-full rounded-lg bg-decorative"
        />
      )}
      <div className="min-w-0">
        <h1>{shown.name}</h1>
        <p className="mt-3 text-2xl font-semibold whitespace-nowrap text-primary-strong">{shown.price}</p>
        {shown.description && <p className="mt-4 max-w-measure">{shown.description}</p>}
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
      </div>
    </article>
  );
}

/**
 * Add to basket (S-011 AC4). Before hydration it is a plain form post (the server
 * redirects to the basket). Once hydrated the post goes through a fetcher: the button
 * shows "Adding…" with a spinner and stays focusable (aria-disabled, aria-busy), repeat
 * taps are ignored until the answer, then "Added to your basket" is announced with a link
 * to the basket while the header count updates.
 */
function AddToBasketForm({ productId, refusal }: { productId: string; refusal?: string }) {
  const { t, locale } = useI18n();
  const fetcher = useFetcher<typeof action>();
  const inFlight = useRef(false);
  const busy = fetcher.state !== "idle";
  const result = fetcher.data;
  const error = result && !result.ok ? result.error.message : refusal;
  const added = fetcher.state !== "submitting" && result?.ok === true;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current || busy) return;
    inFlight.current = true;
    const form = new FormData(event.currentTarget);
    form.set("respond", "inline");
    void fetcher.submit(form, { method: "post" }).finally(() => {
      inFlight.current = false;
    });
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
        {added && (
          <Alert tone="success" title={t("product.added")} className="mt-4">
            <Link to={localePath(locale, "/basket")} className="mt-1 inline-flex min-h-11 items-center font-semibold link">
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
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundContent />;
  return (
    <>
      <h1>{t("errors.genericTitle")}</h1>
      <p className="mt-4">{t("errors.genericBody")}</p>
    </>
  );
}
