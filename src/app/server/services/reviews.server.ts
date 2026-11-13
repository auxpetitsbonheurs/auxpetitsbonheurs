// Reviews behind the pages (E-14; contracts.md v0.41 "Reviews").
// Public read (S-261 AC8, S-266, S-267): the summary and the first page are cached 60 s per
// isolate and cleared in the isolate that changed a review, so an approval shows within 60 s.
// Own review (S-262): validate, rate-limit (5 per hour per account), name step, upsert, delete.
// Logs carry the account id and the action only, never the comment or a name (S-268 AC3).
import { cleanComment, displayName, parseRating, reviewProblems } from "~/domain/review";
import type { Locale } from "~/lib/locale";
import type { CustomerAccount } from "~/server/customer-auth.server";
import type { Database, Executor } from "~/server/db.server";
import { RL_REVIEW, consumeRateLimit } from "~/server/rate-limit.server";
import { updateProfile } from "~/server/repos/customer-accounts.server";
import { type PublicReview, type ReviewSummary, deleteOwnReview, listPublicReviews, reviewSummary, saveOwnReview } from "~/server/repos/reviews.server";

export const REVIEW_CACHE_MS = 60_000;
/** Reviews per page on /reviews (S-267 AC2); Home shows the latest 3 (S-266 AC1). */
export const REVIEWS_PAGE_SIZE = 10;
export const HOME_REVIEWS = 3;

interface CachedFirstPage {
  at: number;
  summary: ReviewSummary;
  latest: PublicReview[];
}

let firstPage: CachedFirstPage | null = null;

/** Forget the cached public read (after any change made in this isolate). */
export function clearReviewCache(): void {
  firstPage = null;
}

/** The summary and the first page, from this isolate's cache when younger than 60 s. */
export async function publicFirstPage(db: Executor, now: Date): Promise<{ summary: ReviewSummary; latest: PublicReview[] }> {
  if (firstPage && now.getTime() - firstPage.at >= 0 && now.getTime() - firstPage.at < REVIEW_CACHE_MS) return firstPage;
  const [summary, latest] = await Promise.all([reviewSummary(db), listPublicReviews(db, { limit: REVIEWS_PAGE_SIZE + 1, offset: 0 })]);
  firstPage = { at: now.getTime(), summary, latest };
  return firstPage;
}

/** The most reviews one /reviews page lists ("Show more" adds 10 at a time up to this). */
export const REVIEWS_MAX_SHOWN = 200;

/**
 * The first `shown` approved reviews for /reviews (S-267 AC2: "Show more" is a plain link to
 * `?shown=20`, so it works before JavaScript, and appends below without shifting what is read).
 * Up to 10 come from the cache; `hasMore` when another exists.
 */
export async function publicReviewsUpTo(db: Executor, now: Date, requested: number): Promise<{ summary: ReviewSummary; reviews: PublicReview[]; hasMore: boolean; shown: number }> {
  const shown = Math.min(REVIEWS_MAX_SHOWN, Math.max(REVIEWS_PAGE_SIZE, Math.ceil(requested / REVIEWS_PAGE_SIZE) * REVIEWS_PAGE_SIZE || REVIEWS_PAGE_SIZE));
  const first = await publicFirstPage(db, now);
  const rows = shown <= REVIEWS_PAGE_SIZE ? first.latest : await listPublicReviews(db, { limit: shown + 1, offset: 0 });
  return { summary: first.summary, reviews: rows.slice(0, shown), hasMore: rows.length > shown, shown };
}

function log(event: string, accountId: string, extra: Record<string, string> = {}) {
  console.log(JSON.stringify({ level: "info", event, account: accountId, ...extra }));
}

export type SubmitResult =
  | { ok: true; status: "pending"; edited: boolean }
  | { ok: false; code: "VALIDATION_FAILED"; fields: Record<string, string> }
  | { ok: false; code: "RATE_LIMITED"; retryAfterSeconds: number };

/** Field -> catalogue key of its message (the page translates). */
const PROBLEM_KEYS = {
  rating: "reviewForm.errors.rating",
  commentMissing: "reviewForm.errors.commentMissing",
  commentTooLong: "reviewForm.errors.commentTooLong",
} as const;

/**
 * Send or edit the signed-in customer's review (S-262 AC3..AC8). When the profile has no name,
 * the form's first and last name are saved to the profile first (AC6). The display name is the
 * profile's at this moment (snapshot; refreshed again when approved).
 */
export async function submitOwnReview(
  db: Database,
  input: { customer: CustomerAccount; form: Record<string, unknown>; locale: Locale; now: Date; hadReview: boolean },
): Promise<SubmitResult> {
  const { customer, form } = input;
  const fields: Record<string, string> = {};
  for (const [field, problem] of Object.entries(reviewProblems({ rating: form.rating, comment: form.comment }))) fields[field] = PROBLEM_KEYS[problem];
  let name = customer.name;
  if (!displayName(name)) {
    const first = typeof form.firstName === "string" ? form.firstName.trim() : "";
    const last = typeof form.lastName === "string" ? form.lastName.trim() : "";
    if (!first || first.length > 40) fields.firstName = "reviewForm.errors.firstName";
    if (!last || last.length > 40) fields.lastName = "reviewForm.errors.lastName";
    name = `${first} ${last}`;
  }
  if (Object.keys(fields).length > 0) return { ok: false, code: "VALIDATION_FAILED", fields };
  const limit = await consumeRateLimit(db, RL_REVIEW, { action: "review.save", parts: [customer.id] }, input.now);
  if (!limit.ok) return { ok: false, code: "RATE_LIMITED", retryAfterSeconds: limit.retryAfterSeconds };
  if (name !== customer.name) await updateProfile(db, customer.id, { name, phone: customer.phone, locale: customer.locale });
  await saveOwnReview(db, customer.id, { rating: parseRating(form.rating)!, comment: cleanComment(form.comment), displayName: displayName(name)!, locale: input.locale });
  clearReviewCache();
  log("review_saved", customer.id, { edited: String(input.hadReview) });
  return { ok: true, status: "pending", edited: input.hadReview };
}

/** Deletes the signed-in customer's review for good (S-262 AC9, S-268). */
export async function deleteOwn(db: Executor, customerId: string): Promise<boolean> {
  const deleted = await deleteOwnReview(db, customerId);
  clearReviewCache();
  if (deleted) log("review_deleted", customerId);
  return deleted !== null;
}
