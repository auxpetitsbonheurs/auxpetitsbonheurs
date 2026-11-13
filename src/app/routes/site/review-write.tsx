// `site/review-write` (`/reviews/write`, `/fr/reviews/write`; S-262, S-268 AC1; contracts.md
// v0.41 "Reviews"). Signed out: a sign-in prompt that returns here (same-site `next`), no form.
// Signed in as a customer: the rating and comment form, or the own review to edit or delete,
// with its status in words. Private (no-store, noindex) with its own `reviewForm` text.
import { PrivacyNoteLink } from "~/components/site/privacy-link";
import { useEffect, useRef, useState } from "react";
import { Form, Link, useNavigation } from "react-router";
import { FocusedStatus, isRefusal } from "~/components/account/account-ui";
import { ReviewForm, type ReviewFormRefusal } from "~/components/site/review-form";
import { Alert } from "~/components/ui/alert";
import { buttonVariants } from "~/components/ui/button";
import { Modal } from "~/components/ui/modal";
import { SubmitButton } from "~/components/ui/submit-button";
import { ownReviewState } from "~/domain/review";
import { namespaceMessages, t as translate } from "~/i18n/catalog.server";
import { ExtraMessages, useI18n } from "~/i18n/react";
import { localePath } from "~/lib/locale";
import { cn } from "~/lib/utils";
import { actionError } from "~/server/action-result.server";
import { clockContext } from "~/server/clock.server";
import { customerSession, pageLocale, requireCustomer } from "~/server/customer-auth.server";
import { requestDbContext } from "~/server/db.server";
import { findOwnReview } from "~/server/repos/reviews.server";
import { responseHeaders } from "~/server/response-headers.server";
import { deleteOwn, submitOwnReview } from "~/server/services/reviews.server";
import { displayName } from "~/domain/review";
import type { Route } from "./+types/review-write";

export const middleware: Route.MiddlewareFunction[] = [responseHeaders({ "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" })];

export async function loader(args: Route.LoaderArgs) {
  const locale = pageLocale(args);
  const base = { messages: namespaceMessages(locale, "reviewForm"), title: translate("reviewForm.metaTitle", locale), path: args.url.pathname };
  const session = await customerSession(args);
  if (session.status !== "customer") return { ...base, signedIn: false as const, admin: session.status === "not_customer" && session.admin };
  const own = await findOwnReview(args.context.get(requestDbContext).db, session.customer.id);
  return {
    ...base,
    signedIn: true as const,
    needsName: displayName(session.customer.name) === null,
    review: own ? { rating: own.rating, comment: own.comment, state: ownReviewState(own.status) } : null,
  };
}

export async function action(args: Route.ActionArgs) {
  const customer = await requireCustomer(args);
  const locale = pageLocale(args);
  const db = args.context.get(requestDbContext).db;
  const form = Object.fromEntries(await args.request.formData());
  if (form.intent === "delete") {
    await deleteOwn(db, customer.id);
    return { ok: true as const, intent: "delete" as const };
  }
  const had = (await findOwnReview(db, customer.id)) !== null;
  const values = { rating: String(form.rating ?? ""), comment: String(form.comment ?? ""), firstName: String(form.firstName ?? ""), lastName: String(form.lastName ?? "") };
  const result = await submitOwnReview(db, { customer, form, locale, now: args.context.get(clockContext).now(), hadReview: had });
  if (result.ok) return { ok: true as const, intent: "save" as const, edited: result.edited };
  if (result.code === "RATE_LIMITED") {
    const minutes = Math.max(1, Math.ceil(result.retryAfterSeconds / 60));
    return actionError("RATE_LIMITED", locale, { extra: { values, retryAfterMinutes: minutes }, headers: { "Retry-After": String(result.retryAfterSeconds) } });
  }
  const fields = Object.fromEntries(Object.entries(result.fields).map(([field, key]) => [field, translate(key, locale)]));
  return actionError("VALIDATION_FAILED", locale, { fields, extra: { values } });
}

export function headers({ actionHeaders }: Route.HeadersArgs) {
  const retryAfter = actionHeaders.get("Retry-After");
  return retryAfter ? { "Retry-After": retryAfter } : new Headers();
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

/** Signed out (or an admin session): why, and the way in that comes back here (AC1). */
function SignInPrompt({ path, admin }: { path: string; admin: boolean }) {
  const { t, locale } = useI18n();
  const next = encodeURIComponent(path);
  return (
    <div className="rounded-card border border-border bg-card p-4 sm:p-6">
      <h2 className="text-xl">{t("reviewForm.signInTitle")}</h2>
      <p className="mt-2">{admin ? t("reviewForm.forbidden") : t("reviewForm.signInBody")}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link to={`${localePath(locale, "/account/sign-in")}?next=${next}`} className={buttonVariants({ size: "lg" })}>
          {t("reviewForm.signIn")}
        </Link>
        <Link to={`${localePath(locale, "/account/sign-up")}?next=${next}`} className={buttonVariants({ size: "lg", variant: "outline" })}>
          {t("reviewForm.createAccount")}
        </Link>
      </div>
    </div>
  );
}

/** "Delete my review" with a confirm dialog (focus trapped and returned, AC9). */
function DeleteReview() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const navigation = useNavigation();
  const deleting = navigation.state !== "idle" && navigation.formData?.get("intent") === "delete";
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn(buttonVariants({ variant: "outline" }), "text-destructive")}>
        {t("reviewForm.delete")}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={t("reviewForm.deleteTitle")} closeLabel={t("reviewForm.cancel")} variant="dialog" returnFocusTo={() => "main"}>
        <p>{t("reviewForm.deleteBody")}</p>
        <Form method="post" className="mt-6 flex flex-wrap justify-end gap-3" onSubmit={() => setOpen(false)}>
          <input type="hidden" name="intent" value="delete" />
          <button type="button" onClick={() => setOpen(false)} className={buttonVariants({ variant: "outline" })}>
            {t("reviewForm.cancel")}
          </button>
          <SubmitButton variant="destructive" pending={deleting} pendingText={t("reviewForm.sending")}>
            {t("reviewForm.deleteConfirm")}
          </SubmitButton>
        </Form>
      </Modal>
    </>
  );
}

function OwnStatus({ state }: { state: "waiting" | "published" | "notPublished" }) {
  const { t } = useI18n();
  return (
    <p className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground">{t("reviewForm.status")}:</span>
      <span className="inline-flex min-h-6 items-center rounded-full border-2 border-border bg-background px-3 py-0.5 text-sm font-semibold">{t(`reviewForm.state.${state}`)}</span>
    </p>
  );
}

function WriteReview({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useI18n();
  const done = actionData && !isRefusal(actionData) && "intent" in actionData ? actionData : null;
  const saved = done?.intent === "save" ? done : null;
  const deleted = done?.intent === "delete";
  const refusal = isRefusal(actionData) ? (actionData as ReviewFormRefusal) : undefined;
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (deleted) headingRef.current?.focus();
  }, [deleted]);
  if (!loaderData.signedIn) return <SignInPrompt path={loaderData.path} admin={loaderData.admin} />;
  const review = deleted ? null : loaderData.review;
  return (
    <div className="flex flex-col gap-6">
      {saved && <FocusedStatus title={"edited" in saved && saved.edited ? t("reviewForm.againAfterApproval") : t("reviewForm.thanks")} />}
      {deleted && (
        <Alert tone="success" role="status" className="outline-offset-2">
          <p className="font-semibold">{t("reviewForm.deleted")}</p>
        </Alert>
      )}
      {review && <OwnStatus state={review.state} />}
      <ReviewForm key={review ? `${review.rating}:${review.comment}` : "new"} review={review} needsName={loaderData.needsName} refusal={refusal} />
      {review && <DeleteReview />}
      <h2 ref={headingRef} tabIndex={-1} className="sr-only">
        {t("reviewForm.title")}
      </h2>
    </div>
  );
}

export default function ReviewWrite(props: Route.ComponentProps) {
  const { loaderData } = props;
  return (
    <ExtraMessages messages={loaderData.messages}>
      <ReviewWritePage {...props} />
    </ExtraMessages>
  );
}

function ReviewWritePage(props: Route.ComponentProps) {
  const { t } = useI18n();
  const { loaderData } = props;
  const editing = loaderData.signedIn && loaderData.review !== null;
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1>{editing ? t("reviewForm.editTitle") : t("reviewForm.title")}</h1>
      <p className="text-sm text-muted-foreground">{t("reviewForm.privacy")}</p>
      {/* S-268 AC1: the link to the privacy note (S-225). */}
      <PrivacyNoteLink className="-mt-2" />
      <WriteReview {...props} />
    </div>
  );
}
