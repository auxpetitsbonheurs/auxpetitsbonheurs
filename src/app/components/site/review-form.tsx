// The review form (E-14 S-262 AC2..AC6, S-269 AC2). The rating is a real radio group (five native
// radios named "1 star" .. "5 stars": arrow keys move, Space selects, a screen reader announces
// "3 stars, 3 of 5"), drawn as 44 px stars with the chosen value also written out ("4 of 5"), so
// the stars are never the only cue. The comment counts characters as you type and stops at 1000.
// A refused send keeps what was typed (AC10).
import { useEffect, useRef, useState } from "react";
import { Form, useNavigation } from "react-router";
import { ErrorSummary } from "~/components/checkout/error-summary";
import { Alert } from "~/components/ui/alert";
import { SubmitButton } from "~/components/ui/submit-button";
import { TextField } from "~/components/ui/text-field";
import { COMMENT_MAX, commentLength } from "~/domain/review";
import { useI18n } from "~/i18n/react";
import { cn } from "~/lib/utils";

export interface ReviewFormRefusal {
  ok: false;
  error: { code: string; message: string; fields?: Record<string, string> };
  values?: { rating?: string; comment?: string; firstName?: string; lastName?: string };
  retryAfterMinutes?: number;
}

const ANCHORS = { rating: "rating-1", comment: "comment", firstName: "firstName", lastName: "lastName" };

function Star({ filled }: { filled: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} className={cn("size-8", filled ? "text-gold" : "text-muted-foreground")} stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinejoin="round" d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3l-5.5 2.9 1-6.2L3 9.6l6.2-.9L12 3Z" />
    </svg>
  );
}

function RatingField({ initial, error }: { initial: number; error?: string }) {
  const { t } = useI18n();
  const [rating, setRating] = useState(initial);
  return (
    <fieldset aria-describedby={cn("rating-chosen", error && "rating-error") || undefined}>
      <legend className="font-semibold">{t("reviewForm.rating")}</legend>
      <div className="mt-2 flex flex-wrap items-center gap-x-1">
        {[1, 2, 3, 4, 5].map((value) => (
          // Each star is a 44 px label around its own native radio (invisible, filling the label).
          <label key={value} className="relative inline-flex size-11 cursor-pointer items-center justify-center rounded-md has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring">
            <input
              type="radio"
              id={`rating-${value}`}
              name="rating"
              value={value}
              defaultChecked={initial === value}
              onChange={() => setRating(value)}
              aria-invalid={error ? true : undefined}
              className="absolute inset-0 size-full cursor-pointer appearance-none rounded-md"
            />
            <span className="sr-only">{t("reviewForm.ratingOption", { count: value })}</span>
            <Star filled={value <= rating} />
          </label>
        ))}
        <span id="rating-chosen" className="ms-2 font-semibold">
          {rating > 0 ? t("reviewForm.ratingChosen", { count: rating }) : t("reviewForm.ratingNone")}
        </span>
      </div>
      {error && (
        <p id="rating-error" className="mt-1 font-semibold text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}

function CommentField({ initial, error }: { initial: string; error?: string }) {
  const { t } = useI18n();
  const [count, setCount] = useState(() => commentLength(initial));
  return (
    <div>
      <label htmlFor="comment" className="block font-semibold">
        {t("reviewForm.comment")}
      </label>
      <p id="comment-hint" className="text-sm text-muted-foreground">
        {t("reviewForm.commentHint")}
      </p>
      <textarea
        id="comment"
        name="comment"
        rows={6}
        maxLength={COMMENT_MAX}
        defaultValue={initial}
        onChange={(event) => setCount(commentLength(event.currentTarget.value))}
        aria-invalid={error ? true : undefined}
        aria-describedby={cn("comment-hint comment-count", error && "comment-error")}
        className="mt-2 block min-h-32 w-full rounded-md border-2 border-input bg-card px-3 py-2 text-base text-foreground aria-invalid:border-destructive"
      />
      {/* Announced politely only when the count is read (aria-describedby), never on each key. */}
      <p id="comment-count" className="mt-1 text-sm text-muted-foreground">
        {t("reviewForm.count", { count })}
      </p>
      {error && (
        <p id="comment-error" className="mt-1 font-semibold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** The form: name step when the profile has none (AC6), rating, comment, Send (or Save changes). */
export function ReviewForm({ review, needsName, refusal }: { review: { rating: number; comment: string } | null; needsName: boolean; refusal?: ReviewFormRefusal }) {
  const { t } = useI18n();
  const navigation = useNavigation();
  const sending = navigation.state !== "idle" && navigation.formMethod === "POST" && navigation.formData?.get("intent") === "save";
  const fields = refusal?.error.fields;
  const values = refusal?.values;
  const summaryRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (refusal) summaryRef.current?.focus();
  }, [refusal]);
  return (
    <Form method="post" noValidate className="grid gap-6 rounded-card border border-border bg-card p-3 min-[20rem]:p-5 sm:p-6">
      <input type="hidden" name="intent" value="save" />
      {refusal && fields && <ErrorSummary ref={summaryRef} message={refusal.error.message} fields={fields} anchors={ANCHORS} title={t("reviewForm.errorSummaryTitle")} />}
      {refusal && !fields && (
        <Alert ref={summaryRef} tone="danger" role="alert" tabIndex={-1} className="outline-offset-2">
          <p className="font-semibold">{refusal.retryAfterMinutes !== undefined ? t("reviewForm.tooMany", { count: refusal.retryAfterMinutes }) : refusal.error.message}</p>
        </Alert>
      )}
      {needsName && (
        <fieldset className="grid gap-4">
          <legend className="text-lg font-semibold">{t("reviewForm.nameTitle")}</legend>
          <p className="-mt-2 text-sm text-muted-foreground">{t("reviewForm.nameIntro")}</p>
          <TextField id="firstName" name="firstName" label={t("reviewForm.firstName")} autoComplete="given-name" maxLength={40} defaultValue={values?.firstName} error={fields?.firstName} />
          <TextField id="lastName" name="lastName" label={t("reviewForm.lastName")} autoComplete="family-name" maxLength={40} defaultValue={values?.lastName} error={fields?.lastName} />
        </fieldset>
      )}
      <RatingField initial={Number(values?.rating ?? review?.rating ?? 0) || 0} error={fields?.rating} />
      <CommentField initial={values?.comment ?? review?.comment ?? ""} error={fields?.comment} />
      <div>
        <SubmitButton pending={sending} pendingText={t("reviewForm.sending")} size="lg" className="w-full sm:w-auto">
          {review ? t("reviewForm.save") : t("reviewForm.send")}
        </SubmitButton>
      </div>
    </Form>
  );
}
