// Reviews (E-14; contracts.md v0.41 "Reviews"). Public reads return ONLY approved rows and only
// the public columns (S-261 AC3, S-267 AC7); everything else is scoped by the caller: the
// customer's own row (by the session's customer id), or an admin decision checked by version.
import { and, desc, eq, sql } from "drizzle-orm";
import { customer, review, reviewEvent } from "~/db/schema";
import { type ReviewMove, type ReviewStatus, averageRating, nextStatus } from "~/domain/review";
import type { Locale } from "~/lib/locale";
import type { Database, Executor } from "~/server/db.server";

/** What a visitor may see of a review: never ids, never a customer link (S-261 AC3). */
export interface PublicReview {
  displayName: string;
  rating: number;
  comment: string;
  locale: Locale;
  /** The approval date, Mauritius calendar day (`YYYY-MM-DD`). */
  date: string;
}

export interface ReviewSummary {
  count: number;
  /** One decimal, half up; null when there is none (S-261 AC4). */
  average: number | null;
}

const muDay = sql<string>`to_char(${review.decidedAt} at time zone 'Indian/Mauritius', 'YYYY-MM-DD')`;

/** The latest approved reviews, newest approval first: one indexed query (S-261 AC8). */
export async function listPublicReviews(db: Executor, page: { limit: number; offset: number }): Promise<PublicReview[]> {
  return db
    .select({ displayName: review.displayName, rating: review.rating, comment: review.comment, locale: review.locale, date: muDay })
    .from(review)
    .where(eq(review.status, "approved"))
    .orderBy(desc(review.decidedAt), desc(review.id))
    .limit(page.limit)
    .offset(page.offset);
}

/** Count and average of the approved reviews: one query (hidden, pending and rejected never count). */
export async function reviewSummary(db: Executor): Promise<ReviewSummary> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int`, sum: sql<number>`coalesce(sum(${review.rating}), 0)::int` })
    .from(review)
    .where(eq(review.status, "approved"));
  const count = row?.count ?? 0;
  return { count, average: averageRating(row?.sum ?? 0, count) };
}

/** The customer's own review (S-262), or null. */
export interface OwnReview {
  id: string;
  rating: number;
  comment: string;
  status: ReviewStatus;
}

export async function findOwnReview(db: Executor, customerId: string): Promise<OwnReview | null> {
  const [row] = await db
    .select({ id: review.id, rating: review.rating, comment: review.comment, status: review.status })
    .from(review)
    .where(eq(review.customerId, customerId))
    .limit(1);
  return row ?? null;
}

/**
 * Send or edit the own review (S-262 AC3, AC5, AC7): one upsert on the customer's unique row, so a
 * double tap leaves one review; any edit goes back to `pending` (hidden from the public until an
 * admin approves it again) and clears the previous decision.
 */
export async function saveOwnReview(db: Executor, customerId: string, input: { rating: number; comment: string; displayName: string; locale: Locale }) {
  const [row] = await db
    .insert(review)
    .values({ customerId, ...input, status: "pending" })
    .onConflictDoUpdate({
      target: review.customerId,
      set: {
        rating: input.rating,
        comment: input.comment,
        displayName: input.displayName,
        locale: input.locale,
        status: "pending",
        decidedBy: null,
        decidedAt: null,
        version: sql`${review.version} + 1`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ id: review.id, status: review.status });
  return row!;
}

/** Deletes the own review for good (S-262 AC9, S-268); true when there was one. */
export async function deleteOwnReview(db: Executor, customerId: string): Promise<{ id: string } | null> {
  const [row] = await db.delete(review).where(eq(review.customerId, customerId)).returning({ id: review.id });
  return row ?? null;
}

/** Admin tabs (S-263 AC1): to approve; published; not published (rejected and hidden). */
export type AdminReviewTab = "toApprove" | "published" | "notPublished";

const TAB_STATUSES: Record<AdminReviewTab, ReviewStatus[]> = {
  toApprove: ["pending"],
  published: ["approved"],
  notPublished: ["rejected", "hidden"],
};

export interface AdminReviewRow {
  id: string;
  rating: number;
  comment: string;
  displayName: string;
  locale: Locale;
  status: ReviewStatus;
  version: number;
  updatedAt: Date;
}

/** One page of a tab, newest change first (S-263 AC1, AC5 "Show more"). */
export async function listAdminReviews(db: Executor, tab: AdminReviewTab, page: { limit: number; offset: number }): Promise<AdminReviewRow[]> {
  return db
    .select({
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      displayName: review.displayName,
      locale: review.locale,
      status: review.status,
      version: review.version,
      updatedAt: review.updatedAt,
    })
    .from(review)
    .where(sql`${review.status} in ${TAB_STATUSES[tab]}`)
    .orderBy(desc(review.updatedAt), desc(review.id))
    .limit(page.limit)
    .offset(page.offset);
}

/** The number on each tab; `toApprove` is also the admin badge (S-264 AC1). */
export async function countReviewsByTab(db: Executor): Promise<Record<AdminReviewTab, number>> {
  const rows = await db.select({ status: review.status, count: sql<number>`count(*)::int` }).from(review).groupBy(review.status);
  const of = (statuses: ReviewStatus[]) => rows.filter((r) => statuses.includes(r.status)).reduce((sum, r) => sum + r.count, 0);
  return { toApprove: of(TAB_STATUSES.toApprove), published: of(TAB_STATUSES.published), notPublished: of(TAB_STATUSES.notPublished) };
}

/** Reviews waiting for approval: one count on the status index (S-264 AC1, uncapped). */
export async function countPendingReviews(db: Executor): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(review).where(eq(review.status, "pending"));
  return row?.count ?? 0;
}

export type DecisionResult = { ok: true; status: ReviewStatus } | { ok: false; code: "NOT_FOUND" | "REVIEW_CHANGED" | "INVALID_TRANSITION" };

/**
 * An Owner's or Admin's decision (S-263 approve/reject, S-265 hide/show): in one transaction the
 * row is locked, the version the screen saw must still be current (else REVIEW_CHANGED: someone
 * decided first, nothing is applied twice, AC4), the move must be allowed (S-261 AC6), and a
 * `review_event` line records who and what, never the text (AC8). Approving refreshes the public
 * name from the reviewer's profile (epic decision: snapshot taken when approved).
 */
export async function decideReview(db: Database, input: { id: string; version: number; move: Exclude<ReviewMove, "submit">; adminId: string; displayName?: string }): Promise<DecisionResult> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select({ status: review.status, version: review.version }).from(review).where(eq(review.id, input.id)).for("update");
    if (!row) return { ok: false, code: "NOT_FOUND" } as const;
    if (row.version !== input.version) return { ok: false, code: "REVIEW_CHANGED" } as const;
    const status = nextStatus(row.status, input.move, "admin");
    if (!status) return { ok: false, code: "INVALID_TRANSITION" } as const;
    await tx
      .update(review)
      .set({
        status,
        decidedBy: input.adminId,
        decidedAt: sql`now()`,
        version: sql`${review.version} + 1`,
        ...(input.move === "approve" && input.displayName ? { displayName: input.displayName } : {}),
      })
      .where(and(eq(review.id, input.id), eq(review.version, input.version)));
    await tx.insert(reviewEvent).values({ reviewId: input.id, action: input.move, adminId: input.adminId });
    return { ok: true, status } as const;
  });
}

/** How long the deciding admin may undo an approval (S-263 AC2 "Undo for a few seconds"). */
export const UNDO_APPROVAL_MS = 30_000;

/**
 * Undo an approval just made (S-263 AC2): only by the admin who approved it, within 30 s, and only
 * if nothing changed since; the review goes back to `pending` (off the site again).
 */
export async function undoApproval(db: Database, input: { id: string; version: number; adminId: string; now: Date }): Promise<DecisionResult> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ status: review.status, version: review.version, decidedBy: review.decidedBy, decidedAt: review.decidedAt })
      .from(review)
      .where(eq(review.id, input.id))
      .for("update");
    if (!row) return { ok: false, code: "NOT_FOUND" } as const;
    if (row.version !== input.version) return { ok: false, code: "REVIEW_CHANGED" } as const;
    const recent = row.decidedAt !== null && input.now.getTime() - row.decidedAt.getTime() <= UNDO_APPROVAL_MS;
    if (row.status !== "approved" || row.decidedBy !== input.adminId || !recent) return { ok: false, code: "INVALID_TRANSITION" } as const;
    await tx.update(review).set({ status: "pending", decidedBy: null, decidedAt: null, version: sql`${review.version} + 1` }).where(eq(review.id, input.id));
    await tx.insert(reviewEvent).values({ reviewId: input.id, action: "undo", adminId: input.adminId });
    return { ok: true, status: "pending" } as const;
  });
}

/** An admin deletes a not-published review on the customer's request (S-268 AC6); logged without text. */
export async function adminDeleteReview(db: Database, input: { id: string; version: number; adminId: string }): Promise<DecisionResult> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select({ status: review.status, version: review.version }).from(review).where(eq(review.id, input.id)).for("update");
    if (!row) return { ok: false, code: "NOT_FOUND" } as const;
    if (row.version !== input.version) return { ok: false, code: "REVIEW_CHANGED" } as const;
    if (row.status !== "rejected" && row.status !== "hidden") return { ok: false, code: "INVALID_TRANSITION" } as const;
    await tx.delete(review).where(eq(review.id, input.id));
    await tx.insert(reviewEvent).values({ reviewId: input.id, action: "delete", adminId: input.adminId });
    return { ok: true, status: row.status } as const;
  });
}

/** The reviewer's current profile name, for the display-name snapshot at approval. */
export async function reviewerName(db: Executor, reviewId: string): Promise<string | null> {
  const [row] = await db.select({ name: customer.name }).from(review).innerJoin(customer, eq(customer.id, review.customerId)).where(eq(review.id, reviewId)).limit(1);
  return row?.name ?? null;
}
