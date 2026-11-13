import { Link } from "react-router";
import { buttonVariants } from "~/components/ui/button";
import { useI18n } from "~/i18n/react";
import { localePath } from "~/lib/locale";
import { cn } from "~/lib/utils";
import { type ReviewCardData, ReviewAverage, ReviewCard } from "./review-card";

export interface HomeReviewsData {
  average: number;
  count: number;
  latest: ReviewCardData[];
}

/**
 * "What our customers say" on Home (S-266): the average and the latest 3 approved reviews,
 * stacked on phones, three across from md; no carousel. Rendered only when at least one review
 * is approved (the caller omits it otherwise: no empty heading, AC2).
 */
export function HomeReviews({ reviews }: { reviews: HomeReviewsData }) {
  const { t, locale } = useI18n();
  return (
    <section aria-labelledby="home-reviews">
      <h2 id="home-reviews" className="section-title text-2xl md:text-3xl">
        {t("reviews.sectionTitle")}
      </h2>
      <div className="mt-4">
        <ReviewAverage average={reviews.average} count={reviews.count} />
      </div>
      <ul className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {reviews.latest.map((review, index) => (
          <li key={`${review.date}-${index}`}>
            <ReviewCard review={review} excerptOnly />
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link to={localePath(locale, "/reviews")} className={cn(buttonVariants({ variant: "outline" }))}>
          {t("reviews.seeAll")}
        </Link>
        <Link to={localePath(locale, "/reviews/write")} className={cn(buttonVariants({ variant: "ghost" }), "link")}>
          {t("reviews.write")}
        </Link>
      </div>
    </section>
  );
}
