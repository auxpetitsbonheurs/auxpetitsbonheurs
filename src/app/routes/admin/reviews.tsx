// `admin/reviews` (`/admin/reviews`; S-263, S-265, S-268 AC6; contracts.md v0.41 "Reviews").
// Owner and Admin. Tabs "To approve (n)", "Published", "Not published" (rejected and hidden, each
// with its word), newest change first, 20 at a time. Approve (with a short Undo), Reject (confirm),
// Hide (confirm), Show, Delete (not published only, confirm). Every decision names the version
// the screen saw: a second admin gets REVIEW_CHANGED and the list refreshes (AC4). Comments are
// plain React text with line breaks kept (AC6).
import { useEffect, useRef, useState } from "react";
import { Link, useFetcher, useRevalidator } from "react-router";
import { AdminErrorBoundary } from "~/components/admin/admin-states";
import { StarRating } from "~/components/site/review-card";
import { Alert } from "~/components/ui/alert";
import { buttonVariants } from "~/components/ui/button";
import { Modal } from "~/components/ui/modal";
import { SubmitButton } from "~/components/ui/submit-button";
import { showToast } from "~/components/ui/toaster";
import { type ReviewMove, adminMoves, displayName } from "~/domain/review";
import { formatDayMonthYear, todayMU } from "~/domain/time";
import { t as translate } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import { cn } from "~/lib/utils";
import { actionError } from "~/server/action-result.server";
import { requireAdmin } from "~/server/auth.server";
import { clockContext } from "~/server/clock.server";
import { requestDbContext } from "~/server/db.server";
import {
  type AdminReviewTab,
  type DecisionResult,
  adminDeleteReview,
  countReviewsByTab,
  decideReview,
  listAdminReviews,
  reviewerName,
  undoApproval,
} from "~/server/repos/reviews.server";
import { clearReviewCache } from "~/server/services/reviews.server";
import type { Route } from "./+types/reviews";

export const handle = { titleKey: "admin.reviews.title" };

const TABS: AdminReviewTab[] = ["toApprove", "published", "notPublished"];
export const ADMIN_REVIEWS_PAGE = 20;

const tabOf = (raw: string | null): AdminReviewTab => (TABS as string[]).includes(raw ?? "") ? (raw as AdminReviewTab) : "toApprove";

export async function loader(args: Route.LoaderArgs) {
  const me = await requireAdmin(args);
  const db = args.context.get(requestDbContext).db;
  const tab = tabOf(args.url.searchParams.get("tab"));
  const shown = Math.min(200, Math.max(ADMIN_REVIEWS_PAGE, Number(args.url.searchParams.get("shown")) || ADMIN_REVIEWS_PAGE));
  const [counts, rows] = await Promise.all([countReviewsByTab(db), listAdminReviews(db, tab, { limit: shown + 1, offset: 0 })]);
  return {
    title: translate("admin.reviews.metaTitle", me.locale),
    tab,
    counts,
    shown,
    hasMore: rows.length > shown,
    reviews: rows.slice(0, shown).map((row) => ({
      id: row.id,
      version: row.version,
      rating: row.rating,
      comment: row.comment,
      displayName: row.displayName,
      locale: row.locale,
      status: row.status,
      date: formatDayMonthYear(todayMU(row.updatedAt), me.locale),
      moves: adminMoves(row.status),
      canDelete: row.status === "rejected" || row.status === "hidden",
    })),
  };
}

type Intent = Exclude<ReviewMove, "submit"> | "delete" | "undo";
const INTENTS: Intent[] = ["approve", "reject", "hide", "show", "delete", "undo"];

async function apply(args: Route.ActionArgs, adminId: string, intent: Intent, id: string, version: number): Promise<DecisionResult> {
  const db = args.context.get(requestDbContext).db;
  if (intent === "delete") return adminDeleteReview(db, { id, version, adminId });
  if (intent === "undo") return undoApproval(db, { id, version, adminId, now: args.context.get(clockContext).now() });
  // Approving takes the public name from the reviewer's profile now (epic decision: snapshot at approval).
  const name = intent === "approve" ? await reviewerName(db, id) : null;
  return decideReview(db, { id, version, move: intent, adminId, displayName: (name && displayName(name)) || undefined });
}

export async function action(args: Route.ActionArgs) {
  const me = await requireAdmin(args);
  const form = Object.fromEntries(await args.request.formData());
  const intent = form.intent as Intent;
  const id = typeof form.id === "string" ? form.id : "";
  const version = Number(form.version);
  if (!INTENTS.includes(intent) || !/^[0-9a-f-]{36}$/i.test(id) || !Number.isInteger(version) || version < 1) return actionError("VALIDATION_FAILED", me.locale);
  const result = await apply(args, me.id, intent, id, version);
  if (!result.ok) return actionError(result.code, me.locale, { extra: { intent, id } });
  clearReviewCache();
  // Who and what only: never the comment or the reviewer's name (S-263 AC8, S-268 AC3).
  console.log(JSON.stringify({ level: "info", event: "review_decided", action: intent, admin: me.id, review: id }));
  return { ok: true as const, intent, id, version: version + 1 };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

export const ErrorBoundary = AdminErrorBoundary;

type ReviewItem = Route.ComponentProps["loaderData"]["reviews"][number];
type Answer = { ok: true; intent: Intent; id: string; version: number } | { ok: false; error: { code: string; message: string } };

const DONE_KEY: Record<Intent, string> = {
  approve: "admin.reviews.approved",
  reject: "admin.reviews.rejected",
  hide: "admin.reviews.hidden",
  show: "admin.reviews.shown",
  delete: "admin.reviews.deleted",
  undo: "admin.reviews.toApprove",
};

/** Moves that ask first (destructive or public-facing removal): the dialog's own button is the filled one. */
const CONFIRM: Partial<Record<Intent, { title: string; body: string }>> = {
  reject: { title: "admin.reviews.rejectTitle", body: "admin.reviews.rejectBody" },
  hide: { title: "admin.reviews.hideTitle", body: "admin.reviews.hideBody" },
  delete: { title: "admin.reviews.deleteTitle", body: "admin.reviews.deleteBody" },
};

/**
 * One fetcher for every decision on the page (keyed): the row that sent it may leave the list
 * once the answer revalidates it (an approved review leaves To approve), so the page, not the
 * row, reads the answer.
 */
const DECISION = "review-decision";

function DecisionForm({ review, intent, label, name, primary }: { review: ReviewItem; intent: Intent; label: string; name: string; primary?: boolean }) {
  const { t } = useI18n();
  const fetcher = useFetcher<Answer>({ key: DECISION });
  const [open, setOpen] = useState(false);
  const confirm = CONFIRM[intent];
  const pending = fetcher.state !== "idle" && fetcher.formData?.get("id") === review.id && fetcher.formData?.get("intent") === intent;
  const fields = (
    <>
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="id" value={review.id} />
      <input type="hidden" name="version" value={review.version} />
    </>
  );
  if (!confirm) {
    return (
      <fetcher.Form method="post">
        {fields}
        <SubmitButton pending={pending} pendingText={label} aria-label={name} variant={primary ? "default" : "outline"}>
          {label}
        </SubmitButton>
      </fetcher.Form>
    );
  }
  return (
    <>
      <button type="button" aria-label={name} onClick={() => setOpen(true)} className={cn(buttonVariants({ variant: "outline" }), "text-destructive")}>
        {label}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={t(confirm.title)} closeLabel={t("admin.reviews.cancel")} variant="dialog">
        <p>{t(confirm.body)}</p>
        <fetcher.Form method="post" className="mt-6 flex flex-wrap justify-end gap-3" onSubmit={() => setOpen(false)}>
          {fields}
          <button type="button" onClick={() => setOpen(false)} className={buttonVariants({ variant: "outline" })}>
            {t("admin.reviews.cancel")}
          </button>
          <SubmitButton variant="destructive" pending={pending} pendingText={label}>
            {label}
          </SubmitButton>
        </fetcher.Form>
      </Modal>
    </>
  );
}

function ReviewRow({ review }: { review: ReviewItem }) {
  const { t } = useI18n();
  const name = review.displayName;
  return (
    <li className="flex min-h-16 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StarRating rating={review.rating} label={t("admin.reviews.stars", { count: review.rating })} />
        {(review.status === "rejected" || review.status === "hidden") && (
          <span className="inline-flex min-h-6 items-center rounded-full border-2 border-border px-3 py-0.5 text-sm font-semibold">{t(`admin.reviews.status.${review.status}`)}</span>
        )}
      </div>
      <p lang={review.locale} className="whitespace-pre-line wrap-anywhere">
        {review.comment}
      </p>
      <p className="text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{name}</span>, {review.date}
      </p>
      {/* 16 px between buttons; the destructive ones are outlined, filled only in their dialog (AC7). */}
      <div className="flex flex-wrap gap-4">
        {review.moves.map((move) => (
          <DecisionForm key={move} review={review} intent={move} label={t(`admin.reviews.${move}`)} name={t(`admin.reviews.${move}Name`, { name })} primary={move === "approve" || move === "show"} />
        ))}
        {review.canDelete && <DecisionForm review={review} intent="delete" label={t("admin.reviews.delete")} name={t("admin.reviews.deleteName", { name })} />}
      </div>
    </li>
  );
}

/** "Review approved. Undo" for 10 seconds after an approval (AC2). */
function UndoApproval({ approved }: { approved: { id: string; version: number } }) {
  const { t } = useI18n();
  const fetcher = useFetcher<Answer>({ key: DECISION });
  return (
    <Alert tone="success" role="status" className="flex flex-wrap items-center justify-between gap-3">
      <p className="font-semibold">{t("admin.reviews.approved")}</p>
      <fetcher.Form method="post">
        <input type="hidden" name="intent" value="undo" />
        <input type="hidden" name="id" value={approved.id} />
        <input type="hidden" name="version" value={approved.version} />
        <SubmitButton variant="outline" pending={fetcher.state !== "idle"} pendingText={t("admin.reviews.undo")}>
          {t("admin.reviews.undo")}
        </SubmitButton>
      </fetcher.Form>
    </Alert>
  );
}

export default function AdminReviews({ loaderData }: Route.ComponentProps) {
  const { t } = useI18n();
  const revalidator = useRevalidator();
  const { tab, counts, reviews, hasMore, shown } = loaderData;
  const [approved, setApproved] = useState<{ id: string; version: number } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!approved) return;
    const timer = setTimeout(() => setApproved(null), 10_000);
    return () => clearTimeout(timer);
  }, [approved]);
  const decision = useFetcher<Answer>({ key: DECISION });
  const handled = useRef<Answer | null>(null);
  const onDone = (answer: Answer) => {
    if (!answer.ok) {
      showToast(answer.error.code === "REVIEW_CHANGED" ? t("admin.reviews.changed") : answer.error.message, "error");
      void revalidator.revalidate();
      return;
    }
    if (answer.intent === "approve") setApproved({ id: answer.id, version: answer.version });
    else {
      setApproved(null);
      showToast(t(DONE_KEY[answer.intent]));
    }
    headingRef.current?.focus();
  };
  useEffect(() => {
    if (decision.state !== "idle" || !decision.data || handled.current === decision.data) return;
    handled.current = decision.data;
    onDone(decision.data);
  });
  return (
    <>
      <h1 ref={headingRef} tabIndex={-1}>
        {t("admin.reviews.title")}
      </h1>
      <nav aria-label={t("admin.reviews.title")} className="mt-4">
        <ul className="flex flex-wrap gap-2">
          {TABS.map((key) => (
            <li key={key}>
              <Link
                to={`?tab=${key}`}
                replace
                aria-current={tab === key ? "page" : undefined}
                className="inline-flex min-h-11 items-center rounded-md border-2 border-border px-4 font-semibold aria-[current=page]:border-primary aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground"
              >
                {t("admin.reviews.tabCount", { label: t(`admin.reviews.tabs.${key}`), count: counts[key] })}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="mt-4">{approved && <UndoApproval approved={approved} />}</div>
      {reviews.length === 0 ? (
        <p className="mt-6 rounded-card border border-border bg-card p-6 text-center">{t(`admin.reviews.empty.${tab}`)}</p>
      ) : (
        <ul className="mt-4 divide-y divide-border rounded-card border border-border bg-card">
          {reviews.map((review) => (
            <ReviewRow key={`${review.id}:${review.version}`} review={review} />
          ))}
        </ul>
      )}
      {hasMore && (
        <Link to={`?tab=${tab}&shown=${shown + ADMIN_REVIEWS_PAGE}`} replace preventScrollReset className={cn(buttonVariants({ variant: "outline" }), "mt-4 w-full")}>
          {t("admin.reviews.showMore")}
        </Link>
      )}
    </>
  );
}
