// Shared pieces of the customer account screens (E-11; design-system "Forms", "Alert").
import { type ReactNode, useEffect, useRef } from "react";
import { Form, NavLink, useNavigation } from "react-router";
import { ErrorSummary } from "~/components/checkout/error-summary";
import { Alert } from "~/components/ui/alert";
import { SubmitButton } from "~/components/ui/submit-button";
import { useI18n } from "~/i18n/react";
import { localePath } from "~/lib/locale";
import { cn } from "~/lib/utils";

/** The refusal envelope an account action answers (contracts.md "Error codes"). */
export interface AccountRefusal {
  ok: false;
  intent?: string;
  error: { code: string; message: string; fields?: Record<string, string> };
  values?: Record<string, string>;
  retryAfterMinutes?: number;
}

export function isRefusal(data: unknown): data is AccountRefusal {
  return typeof data === "object" && data !== null && (data as { ok?: unknown }).ok === false;
}

/** A narrow card for the sign-in, sign-up and reset screens: one `h1`, an intro, the form. */
export function AuthCard({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md">
      {/* Tighter padding below 20rem (200% zoom on a 320 px phone) keeps fields at least 44 px wide. */}
      <div className="rounded-card border border-border bg-card p-3 min-[20rem]:p-5 sm:p-6">
        <h1>{title}</h1>
        {intro && <p className="mt-2">{intro}</p>}
        {children}
      </div>
    </div>
  );
}

/**
 * A refusal: field problems as an error summary linking to each field, anything else as an
 * alert (with the wait time when rate-limited). Focus moves to it so it is read at once.
 */
export function RefusalAlert({ refusal, anchors, message }: { refusal: AccountRefusal | undefined; anchors: Record<string, string>; message?: string }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (refusal) ref.current?.focus();
  }, [refusal]);
  if (!refusal) return null;
  const fields = refusal.error.fields;
  if (fields && Object.keys(fields).length > 0) {
    return <ErrorSummary ref={ref} message={refusal.error.message} fields={fields} anchors={anchors} title={t("account.common.errorSummaryTitle")} />;
  }
  return (
    <Alert ref={ref} tone="danger" role="alert" tabIndex={-1} className="mt-6 outline-offset-2">
      <p className="font-semibold">{message ?? refusal.error.message}</p>
      {refusal.retryAfterMinutes !== undefined && <p className="mt-1">{t("account.common.retryIn", { count: refusal.retryAfterMinutes })}</p>}
    </Alert>
  );
}

/** A success message that is a status region and takes focus when it appears (S-206 AC9, S-208 AC7). */
export function FocusedStatus({ title, children, className }: { title: string; children?: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <Alert ref={ref} tone="success" role="status" tabIndex={-1} className={cn("mt-6 outline-offset-2", className)}>
      <p className="font-semibold">{title}</p>
      {children}
    </Alert>
  );
}

/** True while a POST to `path` (this page's action) is under way. */
export function usePosting(intent?: string): boolean {
  const navigation = useNavigation();
  if (navigation.state === "idle" || navigation.formMethod !== "POST") return false;
  return intent === undefined || navigation.formData?.get("intent") === intent;
}

/**
 * Signed-in account screens: the `h1`, a sub-navigation (My details, My orders) and Sign out
 * (a POST, so a link prefetch or crawler can never sign anyone out).
 */
export function AccountFrame({ title, children }: { title: string; children: ReactNode }) {
  const { t, locale } = useI18n();
  const navigation = useNavigation();
  const signingOut = navigation.state !== "idle" && navigation.formAction?.endsWith("/account/sign-out") === true;
  const links = [
    { to: localePath(locale, "/account"), label: t("account.nav.profile"), end: true },
    { to: localePath(locale, "/account/orders"), label: t("account.nav.orders"), end: false },
    { to: localePath(locale, "/account/addresses"), label: t("account.nav.addresses"), end: false },
  ];
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Long French titles ("Mes coordonnées") break at 200% zoom on a 320 px phone (S-218 AC3). */}
        <h1 className="min-w-0 max-w-full hyphens-auto wrap-anywhere">{title}</h1>
        <Form method="post" action={localePath(locale, "/account/sign-out")}>
          <SubmitButton variant="outline" pending={signingOut} pendingText={t("account.nav.signingOut")} className="max-w-full shrink whitespace-normal px-3">
            {t("account.nav.signOut")}
          </SubmitButton>
        </Form>
      </div>
      <nav aria-label={t("account.nav.label")}>
        <ul className="flex flex-wrap gap-2 [&>li]:max-w-full">
          {links.map((link) => (
            <li key={link.to}>
              <NavLink
                to={link.to}
                end={link.end}
                className="inline-flex min-h-11 max-w-full items-center rounded-md border-2 border-border px-3 text-center font-semibold wrap-anywhere aria-[current=page]:border-primary aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground"
              >
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      {children}
    </div>
  );
}

/** Email language as two labelled radios in a fieldset (works without JavaScript). */
export function LanguageField({ defaultValue, label }: { defaultValue: string; label: string }) {
  const { t } = useI18n();
  return (
    <fieldset>
      <legend className="font-semibold">{label}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {(["en", "fr"] as const).map((value) => (
          // The whole 44 px box is the radio (like RadioCard): the native input fills it, invisible; the dot is drawn.
          <label key={value} className="relative inline-flex min-h-12 max-w-full cursor-pointer items-center gap-2 rounded-md border-2 border-input bg-card px-2 has-checked:border-primary min-[20rem]:px-4 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring">
            <input type="radio" name="locale" value={value} defaultChecked={defaultValue === value} className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-md" />
            <span aria-hidden="true" className="size-5 shrink-0 rounded-full border-2 border-input bg-card peer-checked:border-[6px] peer-checked:border-primary" />
            <span lang={value}>{t(`account.languages.${value}`)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
