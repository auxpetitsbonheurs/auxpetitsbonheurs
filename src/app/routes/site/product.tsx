import { Form, data, isRouteErrorResponse, redirect } from "react-router";
import { NotFoundContent } from "~/components/shell/not-found-content";
import { Alert } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { addLine } from "~/domain/basket";
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
import type { Route } from "./+types/product";

/** `site/product` loader (contracts.md, minimal slice: no options, notice date or promotion). */
export async function loader({ params, context }: Route.LoaderArgs) {
  const record = await findProductBySlug(context.get(requestDbContext).db, params.slug);
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

/** `addToBasket` (contracts.md): re-checks the product server-side, merges, redirects to the basket. */
export async function action({ request, url, context }: Route.ActionArgs) {
  const locale = localeFromPathname(url.pathname);
  const parsed = AddToBasketInput.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) return actionError("VALIDATION_FAILED", locale);
  const { intent: _intent, ...line } = parsed.data;
  const found = (await findProductsByIds(context.get(requestDbContext).db, [line.productId])).get(line.productId);
  if (productProblem(found) !== null) return actionError("PRODUCT_UNAVAILABLE", locale);
  try {
    const lines = addLine(readBasket(request), line, newLineId);
    return redirect(localePath(locale, "/basket"), { headers: { "Set-Cookie": basketCookie(lines) } });
  } catch (error) {
    if (error instanceof DomainError) return domainErrorResult(error, locale);
    throw error;
  }
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
          className="h-auto w-full rounded-lg bg-muted"
        />
      )}
      <div className="min-w-0">
        <h1>{shown.name}</h1>
        <p className="mt-3 text-2xl font-semibold whitespace-nowrap text-primary-strong">{shown.price}</p>
        {shown.description && <p className="mt-4 max-w-measure">{shown.description}</p>}
        {actionData && !actionData.ok && (
          <Alert tone="danger" role="alert" className="mt-6">
            <p>{actionData.error.message}</p>
          </Alert>
        )}
        {shown.addable ? (
          <Form method="post" className="mt-6">
            <input type="hidden" name="intent" value="addToBasket" />
            <input type="hidden" name="productId" value={loaderData.product.id} />
            <input type="hidden" name="quantity" value="1" />
            <Button type="submit" size="lg">
              {t("product.addToBasket")}
            </Button>
          </Form>
        ) : (
          <div className="mt-6">
            <p className="inline-flex rounded-full border-2 border-foreground px-3 py-1 font-semibold">{t("product.soldOut")}</p>
            <p className="mt-3 max-w-measure">{t("product.soldOutHint")}</p>
          </div>
        )}
      </div>
    </article>
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
