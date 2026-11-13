// `account/sign-in` (S-207 password, S-208 one-time link; contracts.md "Customer accounts").
// Public; RL-auth (5 per 15 min per email + IP, per method). One generic refusal for every
// credential problem; the link request always answers the same (no account enumeration).
import { Form, Link, redirect } from "react-router";
import { AuthCard, FocusedStatus, RefusalAlert, isRefusal, usePosting } from "~/components/account/account-ui";
import { BotCheck } from "~/components/account/bot-check";
import { Alert } from "~/components/ui/alert";
import { PasswordField } from "~/components/ui/password-field";
import { SubmitButton } from "~/components/ui/submit-button";
import { TextField } from "~/components/ui/text-field";
import { t as translate } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import { localePath } from "~/lib/locale";
import { cn } from "~/lib/utils";
import { actionError } from "~/server/action-result.server";
import { AUTH_ACTIONS, clearAuthAttempts, consumeAuthAttempt, rateLimitedResult } from "~/server/auth-rate-limit.server";
import { parseEmail } from "~/server/contracts/account";
import { customerSession, pageLocale, safeCustomerNext, signInCustomer } from "~/server/customer-auth.server";
import { assertSameOrigin } from "~/server/origin.server";
import { botCheckPassed, sendSignInLink } from "~/server/services/customer-auth.server";
import { recordUsage } from "~/server/usage.server";
import type { Route } from "./+types/sign-in";

type Method = "password" | "link";

export async function loader(args: Route.LoaderArgs) {
  const locale = pageLocale(args);
  const next = safeCustomerNext(args.url.searchParams.get("next"), locale);
  const session = await customerSession(args);
  if (session.status === "customer") throw redirect(next);
  const method: Method = args.url.searchParams.get("method") === "link" ? "link" : "password";
  return { next, method, linkExpired: args.url.searchParams.get("link") === "expired", title: translate("account.signIn.title", locale) };
}

const fieldMessages = (problems: Record<string, string>, locale: "en" | "fr") =>
  Object.fromEntries(Object.entries(problems).map(([field, key]) => [field, translate(key, locale)]));

async function passwordSignIn(args: Route.ActionArgs, form: Record<string, FormDataEntryValue>) {
  const locale = pageLocale(args);
  const email = parseEmail(form);
  const password = typeof form.password === "string" ? form.password : "";
  const problems = { ...(email.ok ? {} : email.problems), ...(password === "" ? { password: "account.signIn.passwordMissing" } : {}) };
  const values = { email: typeof form.email === "string" ? form.email.trim() : "" };
  if (!email.ok || password === "") return actionError("VALIDATION_FAILED", locale, { fields: fieldMessages(problems, locale), extra: { intent: "password", values } });
  const limit = await consumeAuthAttempt(args, AUTH_ACTIONS.customerSignIn, email.value);
  if (!limit.ok) return rateLimitedResult(limit.retryAfterSeconds, locale, { intent: "password", values });
  if (!(await botCheckPassed(args, form))) return actionError("BOT_CHECK_FAILED", locale, { extra: { intent: "password", values } });
  const result = await signInCustomer(args, { email: email.value, password });
  if (!result.ok) return actionError("INVALID_CREDENTIALS", locale, { extra: { intent: "password", values } });
  await clearAuthAttempts(args, AUTH_ACTIONS.customerSignIn, email.value);
  await recordUsage(args, "sign_in", { method: "password" });
  return redirect(safeCustomerNext(form.next, locale), { headers: result.headers });
}

async function linkSignIn(args: Route.ActionArgs, form: Record<string, FormDataEntryValue>) {
  const locale = pageLocale(args);
  const email = parseEmail(form);
  const values = { email: typeof form.email === "string" ? form.email.trim() : "" };
  if (!email.ok) return actionError("VALIDATION_FAILED", locale, { fields: fieldMessages(email.problems, locale), extra: { intent: "magicLink", values } });
  const limit = await consumeAuthAttempt(args, AUTH_ACTIONS.customerLink, email.value);
  if (!limit.ok) return rateLimitedResult(limit.retryAfterSeconds, locale, { intent: "magicLink", values });
  if (!(await botCheckPassed(args, form))) return actionError("BOT_CHECK_FAILED", locale, { extra: { intent: "magicLink", values } });
  await sendSignInLink(args, email.value, safeCustomerNext(form.next, locale));
  return { ok: true as const, intent: "magicLink" as const, values };
}

export async function action(args: Route.ActionArgs) {
  assertSameOrigin(args.request);
  const form = Object.fromEntries(await args.request.formData());
  return form.intent === "magicLink" ? linkSignIn(args, form) : passwordSignIn(args, form);
}

/** Carries `Retry-After` (RATE_LIMITED) onto the document and `.data` responses. */
export function headers({ actionHeaders }: Route.HeadersArgs) {
  const retryAfter = actionHeaders.get("Retry-After");
  return retryAfter ? { "Retry-After": retryAfter } : new Headers();
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

const ANCHORS = { email: "email", password: "password" };

/** Password or link: two links (they work without JavaScript), the current one marked. */
function MethodSwitch({ method, next }: { method: Method; next: string }) {
  const { t, locale } = useI18n();
  const href = (m: Method) => `${localePath(locale, "/account/sign-in")}?${new URLSearchParams({ ...(m === "link" ? { method: "link" } : {}), next })}`;
  const item = (m: Method, label: string) => (
    <li className="min-w-0">
      <Link
        to={href(m)}
        replace
        aria-current={method === m ? "page" : undefined}
        className={cn(
          "flex min-h-11 items-center justify-center rounded-md px-3 text-center font-semibold",
          method === m ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
        )}
      >
        {label}
      </Link>
    </li>
  );
  return (
    <nav aria-label={t("account.signIn.methods")} className="mt-6">
      {/* Two columns from 20rem; stacked below (200% zoom on a 320 px phone), never a sideways scroll. */}
      <ul className="grid gap-1 rounded-lg border-2 border-border p-1 min-[20rem]:grid-cols-2">
        {item("password", t("account.signIn.withPassword"))}
        {item("link", t("account.signIn.withLink"))}
      </ul>
    </nav>
  );
}

function EmailField({ value, error }: { value?: string; error?: string }) {
  const { t } = useI18n();
  return (
    <TextField
      id="email"
      name="email"
      type="email"
      label={t("account.common.email")}
      autoComplete="email"
      inputMode="email"
      spellCheck={false}
      autoCapitalize="none"
      defaultValue={value}
      error={error}
    />
  );
}

function PasswordForm({ next, refusal }: { next: string; refusal: ReturnType<typeof refusalOf> }) {
  const { t, locale } = useI18n();
  const pending = usePosting("password");
  const fields = refusal?.error.fields;
  const tooMany = refusal?.retryAfterMinutes;
  const message = refusal?.error.code === "INVALID_CREDENTIALS" ? t("account.signIn.wrong") : tooMany !== undefined ? t("account.signIn.tooMany", { count: tooMany }) : undefined;
  return (
    <>
      <RefusalAlert refusal={refusal ? { ...refusal, retryAfterMinutes: undefined } : undefined} anchors={ANCHORS} message={message} />
      <Form method="post" noValidate className="mt-6 grid gap-5">
        <input type="hidden" name="intent" value="password" />
        <BotCheck />
        <input type="hidden" name="next" value={next} />
        <EmailField value={refusal?.values?.email} error={fields?.email} />
        <PasswordField
          id="password"
          name="password"
          label={t("account.common.password")}
          autoComplete="current-password"
          error={fields?.password}
          labels={{ show: t("account.common.showPassword"), hide: t("account.common.hidePassword"), shown: t("account.common.passwordShown"), hidden: t("account.common.passwordHidden") }}
        />
        <SubmitButton pending={pending} pendingText={t("account.signIn.signingIn")} size="lg" className="w-full">
          {t("account.signIn.submit")}
        </SubmitButton>
      </Form>
      <p className="mt-4">
        <Link to={localePath(locale, "/account/reset")} className="inline-flex min-h-11 items-center font-semibold link">
          {t("account.signIn.forgot")}
        </Link>
      </p>
    </>
  );
}

function LinkForm({ next, refusal, sent }: { next: string; refusal: ReturnType<typeof refusalOf>; sent: { email?: string } | null }) {
  const { t } = useI18n();
  const pending = usePosting("magicLink");
  const tooMany = refusal?.retryAfterMinutes;
  const message = tooMany !== undefined ? t("account.signIn.tooMany", { count: tooMany }) : undefined;
  return (
    <>
      <p className="mt-6">{t("account.signIn.linkIntro")}</p>
      {sent && (
        <FocusedStatus title={t("account.signIn.linkSent")}>
          <p className="mt-1">{t("account.signIn.linkSentHint")}</p>
        </FocusedStatus>
      )}
      <RefusalAlert refusal={refusal ? { ...refusal, retryAfterMinutes: undefined } : undefined} anchors={ANCHORS} message={message} />
      <Form method="post" noValidate className="mt-6 grid gap-5">
        <input type="hidden" name="intent" value="magicLink" />
        <BotCheck />
        <input type="hidden" name="next" value={next} />
        <EmailField value={sent?.email ?? refusal?.values?.email} error={refusal?.error.fields?.email} />
        <SubmitButton pending={pending} pendingText={t("account.signIn.linkSending")} size="lg" className="w-full">
          {sent ? t("account.signIn.resend") : t("account.signIn.linkSubmit")}
        </SubmitButton>
      </Form>
    </>
  );
}

const refusalOf = (data: unknown) => (isRefusal(data) ? data : undefined);

export default function SignIn({ loaderData, actionData }: Route.ComponentProps) {
  const { t, locale } = useI18n();
  const refusal = refusalOf(actionData);
  const sent = actionData && !isRefusal(actionData) && actionData.intent === "magicLink" ? { email: actionData.values.email } : null;
  const method: Method = sent || refusal?.intent === "magicLink" ? "link" : loaderData.method;
  return (
    <AuthCard title={t("account.signIn.title")} intro={t("account.signIn.intro")}>
      {loaderData.linkExpired && !actionData && (
        <Alert tone="warning" title={t("account.signIn.linkExpiredTitle")} className="mt-6">
          <p>{t("account.signIn.linkExpired")}</p>
        </Alert>
      )}
      <MethodSwitch method={method} next={loaderData.next} />
      {method === "password" ? <PasswordForm next={loaderData.next} refusal={refusal} /> : <LinkForm next={loaderData.next} refusal={refusal} sent={sent} />}
      <p className="mt-6 border-t border-border pt-4">
        {t("account.signIn.noAccount")}{" "}
        <Link to={`${localePath(locale, "/account/sign-up")}?next=${encodeURIComponent(loaderData.next)}`} className="inline-flex min-h-11 items-center font-semibold link">
          {t("account.signIn.createAccount")}
        </Link>
      </p>
      <p className="mt-2 text-sm text-muted-foreground">{t("account.common.guestNote")}</p>
    </AuthCard>
  );
}
