// `account/sign-up` signUp (S-206; contracts.md "Customer accounts"): name, email, phone and
// email language, NO password (threat-model G-01: the password is chosen only after the email
// is confirmed). Public; RL-signup (3 per hour per IP). Every outcome but a field problem or the
// rate limit shows the same "Check your email" (no account enumeration, AC4).
import { useEffect, useState } from "react";
import { Form, Link, redirect } from "react-router";
import { AuthCard, FocusedStatus, LanguageField, RefusalAlert, isRefusal, usePosting } from "~/components/account/account-ui";
import { SubmitButton } from "~/components/ui/submit-button";
import { TextField } from "~/components/ui/text-field";
import { t as translate } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import { localePath } from "~/lib/locale";
import { actionError } from "~/server/action-result.server";
import { rateLimitedResult } from "~/server/auth-rate-limit.server";
import { parseSignUp } from "~/server/contracts/account";
import { customerSession, pageLocale, safeCustomerNext } from "~/server/customer-auth.server";
import { assertSameOrigin } from "~/server/origin.server";
import { consumeSignUp, signUpCustomer } from "~/server/services/customer-auth.server";
import type { Route } from "./+types/sign-up";

/** The page offers "Send again" after this long (Auth sends at most one email a minute per address). */
const RESEND_AFTER_SECONDS = 60;

export async function loader(args: Route.LoaderArgs) {
  const locale = pageLocale(args);
  const raw = args.url.searchParams.get("next");
  const next = raw ? safeCustomerNext(raw, locale) : localePath(locale, "/account/orders");
  if ((await customerSession(args)).status === "customer") throw redirect(next);
  return { next, title: translate("account.signUp.title", locale) };
}

export async function action(args: Route.ActionArgs) {
  assertSameOrigin(args.request);
  const locale = pageLocale(args);
  const form = Object.fromEntries(await args.request.formData());
  const values = Object.fromEntries(["name", "email", "phone", "locale"].map((key) => [key, typeof form[key] === "string" ? (form[key] as string).trim() : ""]));
  const parsed = parseSignUp(form);
  if (!parsed.ok) {
    const fields = Object.fromEntries(Object.entries(parsed.problems).map(([field, key]) => [field, translate(key as string, locale)]));
    return actionError("VALIDATION_FAILED", locale, { fields, extra: { values } });
  }
  const limit = await consumeSignUp(args, "customer.signUp");
  if (!limit.ok) return rateLimitedResult(limit.retryAfterSeconds, locale, { values });
  const next = typeof form.next === "string" && form.next !== "" ? safeCustomerNext(form.next, parsed.value.locale) : localePath(parsed.value.locale, "/account/orders");
  await signUpCustomer(args, parsed.value, next);
  return { ok: true as const, email: parsed.value.email, values, sentAt: Date.now() };
}

export function headers({ actionHeaders }: Route.HeadersArgs) {
  const retryAfter = actionHeaders.get("Retry-After");
  return retryAfter ? { "Retry-After": retryAfter } : new Headers();
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

const ANCHORS = { name: "name", email: "email", phone: "phone" };

/** Seconds left before "Send again" is offered; counts down once JavaScript runs (remount to restart). */
function useCountdown(seconds: number): number {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    const timer = setInterval(() => setLeft((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, []);
  return left;
}

function CheckEmail({ email, values, next }: { email: string; values: Record<string, string>; next: string }) {
  const { t } = useI18n();
  const left = useCountdown(RESEND_AFTER_SECONDS);
  const pending = usePosting();
  return (
    <>
      <FocusedStatus title={t("account.signUp.checkTitle")}>
        <p className="mt-1 wrap-anywhere">{t("account.signUp.checkBody", { email })}</p>
        <p className="mt-1">{t("account.signUp.checkHint")}</p>
      </FocusedStatus>
      <Form method="post" className="mt-6">
        {Object.entries(values).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <input type="hidden" name="next" value={next} />
        {left > 0 ? (
          <p aria-live="off" className="text-muted-foreground">
            {t("account.signUp.resendIn", { count: left })}
          </p>
        ) : (
          <SubmitButton variant="outline" pending={pending} pendingText={t("account.signUp.creating")}>
            {t("account.signUp.resend")}
          </SubmitButton>
        )}
      </Form>
    </>
  );
}

export default function SignUp({ loaderData, actionData }: Route.ComponentProps) {
  const { t, locale } = useI18n();
  const pending = usePosting();
  const refusal = isRefusal(actionData) ? actionData : undefined;
  const fields = refusal?.error.fields;
  const values = refusal?.values;
  if (actionData && !refusal && "email" in actionData) {
    return (
      <AuthCard title={t("account.signUp.title")}>
        <CheckEmail key={actionData.sentAt} email={actionData.email} values={actionData.values} next={loaderData.next} />
      </AuthCard>
    );
  }
  const tooMany = refusal?.retryAfterMinutes;
  return (
    <AuthCard title={t("account.signUp.title")} intro={t("account.signUp.intro")}>
      <RefusalAlert
        refusal={refusal ? { ...refusal, retryAfterMinutes: undefined } : undefined}
        anchors={ANCHORS}
        message={tooMany !== undefined ? t("account.signIn.tooMany", { count: tooMany }) : undefined}
      />
      <Form method="post" noValidate className="mt-6 grid gap-5">
        <input type="hidden" name="next" value={loaderData.next} />
        <TextField id="name" name="name" label={t("account.signUp.name")} autoComplete="name" maxLength={80} defaultValue={values?.name} error={fields?.name} />
        <TextField
          id="email"
          name="email"
          type="email"
          label={t("account.common.email")}
          autoComplete="email"
          inputMode="email"
          spellCheck={false}
          autoCapitalize="none"
          defaultValue={values?.email}
          error={fields?.email}
        />
        <TextField id="phone" name="phone" type="tel" label={t("account.signUp.phone")} hint={t("account.signUp.phoneHint")} autoComplete="tel" inputMode="tel" defaultValue={values?.phone} error={fields?.phone} />
        <LanguageField defaultValue={values?.locale || locale} label={t("account.signUp.language")} />
        <SubmitButton pending={pending} pendingText={t("account.signUp.creating")} size="lg" className="w-full">
          {t("account.signUp.submit")}
        </SubmitButton>
      </Form>
      <p className="mt-6 border-t border-border pt-4">
        {t("account.signUp.haveAccount")}{" "}
        <Link to={`${localePath(locale, "/account/sign-in")}?next=${encodeURIComponent(loaderData.next)}`} className="inline-flex min-h-11 items-center font-semibold link">
          {t("account.signUp.signIn")}
        </Link>
      </p>
      <p className="mt-2 text-sm text-muted-foreground">{t("account.common.guestNote")}</p>
    </AuthCard>
  );
}
