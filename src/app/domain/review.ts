// Bakery reviews (E-14, FR-082..FR-086): the rules that decide what a review may hold, how the
// reviewer is named in public, which status moves are allowed and how the average is shown.
// Pure: no database, no React.

export const REVIEW_STATUSES = ["pending", "approved", "rejected", "hidden"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const RATING_MIN = 1;
export const RATING_MAX = 5;
export const COMMENT_MAX = 1000;

/** Who moves a review: the customer (send, edit) or an Owner/Admin (decide, hide, show). */
export type ReviewActor = "customer" | "admin";
export type ReviewMove = "submit" | "approve" | "reject" | "hide" | "show";

/** Comment length as people count it (user-perceived characters; an emoji is one). */
export function commentLength(comment: string): number {
  return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(comment)].length;
}

export type ReviewProblem = "rating" | "commentMissing" | "commentTooLong";

/** A whole number 1..5 (S-261 AC2): 0, 6 and 3.5 are refused. */
export function parseRating(raw: unknown): number | null {
  const value = typeof raw === "number" ? raw : typeof raw === "string" && /^\d$/.test(raw.trim()) ? Number(raw.trim()) : Number.NaN;
  return Number.isInteger(value) && value >= RATING_MIN && value <= RATING_MAX ? value : null;
}

/** Plain text, trimmed, 1..1000 characters (S-261 AC2); CR LF becomes LF so the count matches the page. */
export function cleanComment(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/\r\n?/g, "\n").trim() : "";
}

export function reviewProblems(input: { rating: unknown; comment: unknown }): Partial<Record<"rating" | "comment", ReviewProblem>> {
  const problems: Partial<Record<"rating" | "comment", ReviewProblem>> = {};
  if (parseRating(input.rating) === null) problems.rating = "rating";
  const comment = cleanComment(input.comment);
  if (comment === "") problems.comment = "commentMissing";
  else if (commentLength(comment) > COMMENT_MAX) problems.comment = "commentTooLong";
  return problems;
}

/**
 * The public name (S-261 AC5): the first word and the initial of the second word, as the story
 * spells it ("Anna Kowalski" -> "Anna K.", "Marie Claire Dupont" -> "Marie C."); one word stays as
 * it is; accents are kept; extra spaces are ignored; an empty name -> null (the form asks first).
 */
export function displayName(fullName: string): string | null {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const [first, second] = words;
  if (!second) return first!;
  const initial = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(second)][0]?.segment ?? "";
  return `${first} ${initial.toLocaleUpperCase()}.`;
}

/** Allowed moves (S-261 AC6); anything else is INVALID_TRANSITION. */
const MOVES: Record<ReviewMove, { actor: ReviewActor; from: readonly (ReviewStatus | "new")[]; to: ReviewStatus }> = {
  submit: { actor: "customer", from: ["new", "pending", "approved", "rejected", "hidden"], to: "pending" },
  approve: { actor: "admin", from: ["pending"], to: "approved" },
  reject: { actor: "admin", from: ["pending"], to: "rejected" },
  hide: { actor: "admin", from: ["approved"], to: "hidden" },
  show: { actor: "admin", from: ["hidden"], to: "approved" },
};

/** The status after `move`, or null when the move is not allowed from `from` for `actor`. */
export function nextStatus(from: ReviewStatus | "new", move: ReviewMove, actor: ReviewActor): ReviewStatus | null {
  const rule = MOVES[move];
  return rule.actor === actor && rule.from.includes(from) ? rule.to : null;
}

/** The moves an admin screen offers for a status (Approve/Reject, Hide, Show). */
export function adminMoves(status: ReviewStatus): Exclude<ReviewMove, "submit">[] {
  return (Object.keys(MOVES) as Exclude<ReviewMove, "submit">[]).filter((move) => nextStatus(status, move, "admin") !== null);
}

/** Average to one decimal, rounded half up (S-261 AC4: 5, 4, 4 -> 4.3); null when there is none. */
export function averageRating(sum: number, count: number): number | null {
  if (count <= 0) return null;
  return Math.floor((sum * 10) / count + 0.5 + 1e-9) / 10;
}

/** What the customer sees about their own review (S-262 AC5, S-265 AC4): hidden reads like rejected. */
export type OwnReviewState = "waiting" | "published" | "notPublished";

export function ownReviewState(status: ReviewStatus): OwnReviewState {
  if (status === "pending") return "waiting";
  return status === "approved" ? "published" : "notPublished";
}

/** The first `max` characters of a comment for the Home card (S-266 AC3), cut on a word when possible. */
export function excerpt(comment: string, max = 160): { text: string; cut: boolean } {
  const graphemes = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(comment)].map((s) => s.segment);
  if (graphemes.length <= max) return { text: comment, cut: false };
  const head = graphemes.slice(0, max).join("");
  const space = head.lastIndexOf(" ");
  return { text: `${(space > max * 0.6 ? head.slice(0, space) : head).trimEnd()}…`, cut: true };
}
