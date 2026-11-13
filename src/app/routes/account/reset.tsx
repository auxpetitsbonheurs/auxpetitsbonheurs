// `account/reset` (S-209 reset, S-206 AC2/AC3 first password with `?mode=new`; contracts.md).
// requestReset: any email, the same answer (no enumeration), RL-auth. setPassword: only with a
// session made by an emailed link in the last hour (recovery, sign-up confirmation or sign-in
// link) that belongs to a customer account (AC6); 10..72 characters; other devices are
// signed out afterwards.
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
import { actionError } from "~/server/action-result.server";
import { endOtherSessions, authContext } from "~/server/auth-gateway.server";
import { AUTH_ACTIONS, consumeAuthAttempt, rateLimitedResult } from "~/server/auth-rate-limit.server";
import { recoverySession } from "~/server/auth.server";
import { parseEmail, passwordProblem } from "~/server/contracts/account";
import { customerSession, pageLocale, safeCustomerNext } from "~/server/customer-auth.server";
import { assertSameOrigin } from "~/server/origin.server";
import { botCheckPassed, requestCustomerReset } from "~/server/services/customer-auth.server";
import type { Route } from "./+types/reset";

type Args = Route.LoaderArgs | Route.ActionArgs;

/** The customer whose emailed-link session (≤ 1 hour old) may choose a password, else null. */
async function linkSessionCustomer(args: Args) {
  if (!(await recoverySession(args))) return null;
  const session = await customerSession(args);
  return session.status === "customer" ? session.customer : null;
}

export async function loader(args: Route.LoaderArgs) {
  const locale = pageLocale(args);
  const params = args.url.searchParams;
  const firstPassword = params.get("mode") === "new";
  const next = safeCustomerNext(params.get("next"), locale);
  const canSet = (await linkSessionCustomer(args)) !== null;
  return {
    state: canSet ? ("set" as const) : ("request" as const),
    firstPassword,
    next,
    expired: !canSet && (params.get("expired") === "1" || firstPassword),
    title: translate(canSet ? (firstPassword ? "account.reset.newTitle" : "account.reset.setTitle") : "account.reset.requestTitle", locale),
  };
}

async function requestReset(args: Route.ActionArgs, form: Record<string, FormDataEntryValue>) {
  const locale = pageLocale(args);
  const email = parseEmail(form);
  const values = { email: typeof form.email === "string" ? form.email.trim() : "" };
  if (!email.ok) {
    const fields = Object.fromEntries(Object.entries(email.problems).map(([field, key]) => [field, translate(key as string, locale)]));
    return actionError("VALIDATION_FAILED", locale, { fields, extra: { intent: "requestReset", values } });
  }
  const limit = await consumeAuthAttempt(args, AUTH_ACTIONS.customerReset, email.value);
  if (!limit.ok) return rateLimitedResult(limit.retryAfterSeconds, locale, { intent: "requestReset", values });
  if (!(await botCheckPassed(args, form))) return actionError("BOT_CHECK_FAILED", locale, { extra: { intent: "requestReset", values } });
  await requestCustomerReset(args, email.value, locale);
  return { ok: true as const, intent: "requestReset" as const };
}

async function setPassword(args: Route.ActionArgs, form: Record<string, FormDataEntryValue>) {
  const locale = pageLocale(args);
  const customer = await linkSessionCustomer(args);
  if (!customer) return actionError("LINK_EXPIRED", locale, { extra: { intent: "setPassword" } });
  const problem = passwordProblem(form.password);
  if (problem) return actionError("VALIDATION_FAILED", locale, { fields: { password: translate(problem, locale) }, extra: { intent: "setPassword" } });
  const limit = await consumeAuthAttempt(args, AUTH_ACTIONS.customerSetPassword, customer.id);
  if (!limit.ok) return rateLimitedResult(limit.retryAfterSeconds, locale, { intent: "setPassword" });
  const gateway = args.context.get(authContext);
  const result = await gateway.updatePassword(String(form.password));
  if (!result.ok && result.reason === "weak") {
    return actionError("VALIDATION_FAILED", locale, { fields: { password: translate("account.reset.passwordWeak", locale) }, extra: { intent: "setPassword" } });
  }
  if (!result.ok) return actionError("INTERNAL", locale, { extra: { intent: "setPassword" } });
  await endOtherSessions(gateway, "customer_set_password");
  const headers = new Headers();
  for (const cookie of gateway.takeSetCookies()) headers.append("Set-Cookie", cookie);
  return redirect(safeCustomerNext(form.next, locale), { headers });
}

export async function action(args: Route.ActionArgs) {
  assertSameOrigin(args.request);
  const form = Object.fromEntries(await args.request.formData());
  return form.intent === "setPassword" ? setPassword(args, form) : requestReset(args, form);
}

export function headers({ actionHeaders }: Route.HeadersArgs) {
  const retryAfter = actionHeaders.get("Retry-After");
  return retryAfter ? { "Retry-After": retryAfter } : new Headers();
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

function SetPasswordForm({ firstPassword, next, actionData }: { firstPassword: boolean; next: string; actionData: unknown }) {
  const { t } = useI18n();
  const pending = usePosting("setPassword");
  const refusal = isRefusal(actionData) ? actionData : undefined;
  const tooMany = refusal?.retryAfterMinutes;
  return (
    <AuthCard title={t(firstPassword ? "account.reset.newTitle" : "account.reset.setTitle")} intro={firstPassword ? t("account.reset.newIntro") : undefined}>
      <RefusalAlert
        refusal={refusal ? { ...refusal, retryAfterMinutes: undefined } : undefined}
        anchors={{ password: "password" }}
        message={tooMany !== undefined ? t("account.signIn.tooMany", { count: tooMany }) : undefined}
      />
      <Form method="post" noValidate className="mt-6 grid gap-5">
        <input type="hidden" name="intent" value="setPassword" />
        <input type="hidden" name="next" value={next} />
        <PasswordField
          id="password"
          name="password"
          label={t("account.reset.newPassword")}
          hint={t("account.reset.hint")}
          autoComplete="new-password"
          error={refusal?.error.fields?.password}
          labels={{ show: t("account.common.showPassword"), hide: t("account.common.hidePassword"), shown: t("account.common.passwordShown"), hidden: t("account.common.passwordHidden") }}
        />
        <SubmitButton pending={pending} pendingText={t("account.reset.saving")} size="lg" className="w-full">
          {t("account.reset.submit")}
        </SubmitButton>
      </Form>
      {firstPassword && (
        <p className="mt-4">
          <Link to={next} className="inline-flex min-h-11 items-center font-semibold link">
            {t("account.reset.skip")}
          </Link>
        </p>
      )}
    </AuthCard>
  );
}

function RequestForm({ expired, actionData }: { expired: boolean; actionData: unknown }) {
  const { t, locale } = useI18n();
  const pending = usePosting("requestReset");
  const refusal = isRefusal(actionData) ? actionData : undefined;
  const sent = actionData !== undefined && !refusal;
  const tooMany = refusal?.retryAfterMinutes;
  return (
    <AuthCard title={t("account.reset.requestTitle")} intro={t("account.reset.requestIntro")}>
      {expired && !actionData && (
        <Alert tone="warning" title={t("account.reset.expiredTitle")} className="mt-6">
          <p>{t("account.reset.expiredBody")}</p>
        </Alert>
      )}
      {sent && <FocusedStatus title={t("account.reset.requestSent")} />}
      <RefusalAlert
        refusal={refusal ? { ...refusal, retryAfterMinutes: undefined } : undefined}
        anchors={{ email: "email" }}
        message={tooMany !== undefined ? t("account.signIn.tooMany", { count: tooMany }) : undefined}
      />
      <Form method="post" noValidate className="mt-6 grid gap-5">
        <input type="hidden" name="intent" value="requestReset" />
        <BotCheck />
        <TextField
          id="email"
          name="email"
          type="email"
          label={t("account.common.email")}
          autoComplete="email"
          inputMode="email"
          spellCheck={false}
          autoCapitalize="none"
          defaultValue={refusal?.values?.email}
          error={refusal?.error.fields?.email}
        />
        <SubmitButton pending={pending} pendingText={t("account.reset.requesting")} size="lg" className="w-full">
          {expired ? t("account.reset.requestAgain") : t("account.reset.requestSubmit")}
        </SubmitButton>
      </Form>
      <p className="mt-4">
        <Link to={localePath(locale, "/account/sign-in")} className="inline-flex min-h-11 items-center font-semibold link">
          {t("account.signIn.title")}
        </Link>
      </p>
    </AuthCard>
  );
}

export default function Reset({ loaderData, actionData }: Route.ComponentProps) {
  if (loaderData.state === "set") return <SetPasswordForm firstPassword={loaderData.firstPassword} next={loaderData.next} actionData={actionData} />;
  return <RequestForm expired={loaderData.expired} actionData={actionData} />;
}
