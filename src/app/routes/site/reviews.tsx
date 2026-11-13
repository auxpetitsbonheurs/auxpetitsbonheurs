// `site/reviews` (`/reviews`, `/fr/reviews`; S-267, contracts.md v0.41): the average and count,
// then the approved reviews newest first, 10 at a time ("Show more" is a link to `?shown=20`).
// Only approved reviews and only their public fields reach the page (AC7). No Review or
// AggregateRating structured data (policy; PRD question 18, S-268 AC5). Indexed only once at
// least one review is approved (AC5, AC6).
import { Link, data, isRouteErrorResponse, useRouteError } from "react-router";
import { ReviewAverage, ReviewCard } from "~/components/site/review-card";
import { SitePageError } from "~/components/site/page-error";
import { buttonVariants } from "~/components/ui/button";
import { t } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import { localeFromPathname, localePath } from "~/lib/locale";
import { SEO_HANDLE, rootOrigin, seoMeta } from "~/lib/seo";
import { cn } from "~/lib/utils";
import { clockContext } from "~/server/clock.server";
import { customerSession, hasSignedInHint } from "~/server/customer-auth.server";
import { requestDbContext } from "~/server/db.server";
import { findOwnReview } from "~/server/repos/reviews.server";
import { timed } from "~/server/server-timing.server";
import { publicReviewsUpTo } from "~/server/services/reviews.server";
import type { Route } from "./+types/reviews";

export const handle = SEO_HANDLE;

/** "Edit my review" for a signed-in customer who has one; costs a session read only when the hint cookie says signed in. */
async function hasOwnReview(args: Route.LoaderArgs): Promise<boolean> {
  if (!hasSignedInHint(args.request)) return false;
  const session = await customerSession(args);
  return session.status === "customer" && (await findOwnReview(args.context.get(requestDbContext).db, session.customer.id)) !== null;
}

export async function loader(args: Route.LoaderArgs) {
  const locale = localeFromPathname(args.url.pathname);
  const requested = Number(args.url.searchParams.get("shown") ?? "10");
  try {
    const [page, ownReview] = await Promise.all([
      timed(args.context, "reviews", () => publicReviewsUpTo(args.context.get(requestDbContext).db, args.context.get(clockContext).now(), requested)),
      hasOwnReview(args).catch(() => false),
    ]);
    return {
      title: t("reviews.metaTitle", locale),
      description: t("reviews.metaDescription", locale),
      summary: page.summary,
      reviews: page.reviews,
      hasMore: page.hasMore,
      shown: page.shown,
      ownReview,
    };
  } catch (error) {
    console.log(JSON.stringify({ level: "warn", event: "reviews_read_failed", error: error instanceof Error ? error.name : "unknown" }));
    throw data(null, { status: 503 });
  }
}

export function meta({ loaderData, matches, location }: Route.MetaArgs) {
  if (!loaderData) return [];
  const locale = localeFromPathname(location.pathname);
  return seoMeta({
    origin: rootOrigin(matches),
    locale,
    path: "/reviews",
    title: loaderData.title,
    description: loaderData.description,
    image: null,
    noindex: loaderData.summary.count === 0,
  });
}

export default function Reviews({ loaderData }: Route.ComponentProps) {
  const { t, locale } = useI18n();
  const { summary, reviews, hasMore, shown, ownReview } = loaderData;
  const write = (
    <Link to={localePath(locale, "/reviews/write")} className={cn(buttonVariants({ size: "lg" }))}>
      {ownReview ? t("reviews.edit") : t("reviews.write")}
    </Link>
  );
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1>{t("reviews.pageTitle")}</h1>
        <p className="mt-2">{t("reviews.intro")}</p>
      </div>
      {summary.count === 0 || summary.average === null ? (
        <div className="rounded-card border border-border bg-card p-6 text-center">
          <p>{t("reviews.empty")}</p>
          <div className="mt-4">{write}</div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <ReviewAverage average={summary.average} count={summary.count} />
            {write}
          </div>
          <ul className="grid gap-4">
            {reviews.map((review, index) => (
              <li key={`${review.date}-${index}`}>
                <ReviewCard review={review} headingLevel={2} />
              </li>
            ))}
          </ul>
          {hasMore && (
            <Link to={`?shown=${shown + 10}`} preventScrollReset replace className={cn(buttonVariants({ variant: "outline" }), "self-center")}>
              {t("reviews.showMore")}
            </Link>
          )}
        </>
      )}
    </div>
  );
}

/** The read failed (AC3): a calm error with Retry inside the site frame. */
export function ErrorBoundary() {
  const { t } = useI18n();
  const error = useRouteError();
  return <SitePageError title={isRouteErrorResponse(error) && error.status === 503 ? t("reviews.loadFailed") : t("errors.genericTitle")} />;
}
