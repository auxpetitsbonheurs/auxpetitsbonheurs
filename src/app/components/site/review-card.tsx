// Review display (E-14 S-266, S-267): the star rating as text plus decorative stars, and the
// review card. Server-rendered, no state, no client logic: the comment is React text (escaped,
// S-266 AC3, S-267 AC7) with its line breaks kept, in the language it was written (`lang`).
import { Link } from "react-router";
import { formatDayMonthYear } from "~/domain/time";
import { excerpt } from "~/domain/review";
import { useI18n } from "~/i18n/react";
import type { Locale } from "~/lib/locale";
import { localePath } from "~/lib/locale";
import { cn } from "~/lib/utils";

/** One star, drawn inline (no icon chunk shared with other routes). */
function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={cn("size-5", filled ? "fill-current text-gold" : "fill-none text-muted-foreground")} stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinejoin="round" d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3l-5.5 2.9 1-6.2L3 9.6l6.2-.9L12 3Z" />
    </svg>
  );
}

/** Stars are decoration; the text ("4 of 5") is what is read and what carries the meaning. */
export function StarRating({ rating, label, className }: { rating: number; label: string; className?: string }) {
  const rounded = Math.round(rating);
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-2", className)}>
      <span aria-hidden="true" className="inline-flex">
        {[1, 2, 3, 4, 5].map((n) => (
          <StarIcon key={n} filled={n <= rounded} />
        ))}
      </span>
      <span className="font-semibold">{label}</span>
    </span>
  );
}

export interface ReviewCardData {
  displayName: string;
  rating: number;
  comment: string;
  locale: Locale;
  date: string;
}

/**
 * One review: stars with "5 of 5", the comment (plain text, line breaks kept), "Anna K." and the
 * date. `excerptOnly` (Home) shows the first 160 characters with "Read more" to /reviews.
 */
export function ReviewCard({ review, excerptOnly = false, headingLevel = 3 }: { review: ReviewCardData; excerptOnly?: boolean; headingLevel?: 2 | 3 }) {
  const { t, locale } = useI18n();
  const shown = excerptOnly ? excerpt(review.comment) : { text: review.comment, cut: false };
  const Heading = `h${headingLevel}` as "h2" | "h3";
  return (
    <article className="flex h-full flex-col gap-3 rounded-card border border-border bg-card p-4 wrap-anywhere">
      <StarRating rating={review.rating} label={t("reviews.stars", { count: review.rating })} />
      <p lang={review.locale === locale ? undefined : review.locale} className="whitespace-pre-line">
        {shown.text}
      </p>
      {shown.cut && (
        <Link to={localePath(locale, "/reviews")} aria-label={t("reviews.readMoreName", { name: review.displayName })} className="inline-flex min-h-11 items-center self-start font-semibold link">
          {t("reviews.readMore")}
        </Link>
      )}
      <footer className="mt-auto text-sm text-muted-foreground">
        <Heading className="inline font-body text-base font-semibold text-foreground">{review.displayName}</Heading>
        {", "}
        <time dateTime={review.date}>{formatDayMonthYear(review.date, locale)}</time>
      </footer>
    </article>
  );
}

/** "4.5 out of 5" with stars, and "from 2 reviews" (S-266 AC1, S-267 AC1). */
export function ReviewAverage({ average, count }: { average: number; count: number }) {
  const { t, locale } = useI18n();
  const shown = new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(average);
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <StarRating rating={average} label={t("reviews.average", { average: shown })} className="text-lg" />
      <span className="text-muted-foreground">{t("reviews.fromCount", { count })}</span>
    </p>
  );
}
