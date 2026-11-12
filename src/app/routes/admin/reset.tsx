import { useEffect, useRef } from "react";
import { Form, Link, data, redirect, useNavigation } from "react-router";
import { AuthPage } from "~/components/admin/auth-page";
import { ErrorSummary } from "~/components/checkout/error-summary";
import { Alert } from "~/components/ui/alert";
import { PasswordField } from "~/components/ui/password-field";
import { SubmitButton } from "~/components/ui/submit-button";
import { t as translate } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import type { Locale } from "~/lib/locale";
import { actionError } from "~/server/action-result.server";
import { adminMiddleware, adminPageLocale } from "~/server/admin-page.server";
import { authContext } from "~/server/auth-gateway.server";
import { AUTH_ACTIONS, clearAuthAttempts, consumeAuthAttempt, rateLimitedResult } from "~/server/auth-rate-limit.server";
import { ADMIN_HOME, LOGIN_PATH, recoverySession, signInAdmin } from "~/server/auth.server";
import { newPasswordProblem } from "~/server/contracts/admin";
import { requestDbContext } from "~/server/db.server";
import { assertSameOrigin } from "~/server/origin.server";
import { findAdminById } from "~/server/repos/admins.server";
import type { Route } from "./+types/reset";

export const middleware: Route.MiddlewareFunction[] = adminMiddleware;

/**
 * `admin/reset` (public, recovery session from `auth/confirm`): `{ email }`, or 410 with
 * the expired state when there is no recovery session from the last hour (S-026 AC4).
 */
export async function loader(args: Route.LoaderArgs) {
  const locale = adminPageLocale(args);
  const title = translate("admin.reset.metaTitle", locale);
  const session = await recoverySession(args);
  if (!session) return data({ expired: true as const, title, email: null }, { status: 410 });
  const admin = await findAdminById(args.context.get(requestDbContext).db, session.userId);
  return { expired: false as const, title, email: admin?.active ? admin.email : null };
}

const PASSWORD_MESSAGES = { tooShort: "admin.reset.errors.tooShort", tooLong: "admin.reset.errors.tooLong", weak: "admin.reset.errors.weak" } as const;

const passwordRefusal = (problem: keyof typeof PASSWORD_MESSAGES, locale: Locale) =>
  actionError("VALIDATION_FAILED", locale, { fields: { password: translate(PASSWORD_MESSAGES[problem], locale) } });

/**
 * `admin/reset` setPassword `{ password }` (S-026). Order: recovery session (else 410) →
 * field check → RL-auth (per account + IP) → active admin (else the same 410 and the
 * recovery session ends: nothing tells a customer or a deactivated admin apart) → set
 * the password → end the recovery session and sign in with the new password, so the
 * admin carries on with a fresh session (no reuse of the link's session) → Today.
 */
export async function action(args: Route.ActionArgs) {
  assertSameOrigin(args.request);
  const locale = adminPageLocale(args);
  const session = await recoverySession(args);
  if (!session) return actionError("LINK_EXPIRED", locale);
  const password = String((await args.request.formData()).get("password") ?? "");
  const problem = newPasswordProblem(password);
  if (problem) return passwordRefusal(problem, locale);
  const limit = await consumeAuthAttempt(args, AUTH_ACTIONS.reset, session.userId);
  if (!limit.ok) return rateLimitedResult(limit.retryAfterSeconds, locale, {});
  const gateway = args.context.get(authContext);
  const admin = await findAdminById(args.context.get(requestDbContext).db, session.userId);
  if (!admin?.active) {
    await gateway.signOut();
    return actionError("LINK_EXPIRED", locale);
  }
  const update = await gateway.updatePassword(password);
  if (!update.ok) return update.reason === "weak" ? passwordRefusal("weak", locale) : actionError("INTERNAL", locale);
  await gateway.signOut();
  const signedIn = await signInAdmin(args, { email: admin.email, password });
  await clearAuthAttempts(args, AUTH_ACTIONS.reset, session.userId);
  // The password is set either way; if the fresh sign-in failed, the login page takes it from here.
  return redirect(signedIn.ok ? ADMIN_HOME : LOGIN_PATH, signedIn.ok ? { headers: signedIn.headers } : undefined);
}

/** Carries the action's `Retry-After` (RATE_LIMITED) onto the response. */
export function headers({ actionHeaders }: Route.HeadersArgs) {
  const retryAfter = actionHeaders.get("Retry-After");
  return retryAfter ? { "Retry-After": retryAfter } : new Headers();
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

interface ResetRefusal {
  ok: false;
  error: { code: string; message: string; fields?: Record<string, string> };
  retryAfterMinutes?: number;
}

function Expired() {
  const { t } = useI18n();
  return (
    <>
      <h1>{t("admin.reset.expiredTitle")}</h1>
      <Alert tone="warning" role="alert" className="mt-6">
        <p className="font-semibold">{t("admin.reset.expired")}</p>
      </Alert>
      <p className="mt-6">
        <Link to="/admin/forgot" className="inline-flex min-h-11 items-center font-semibold link">
          {t("admin.reset.requestNew")}
        </Link>
      </p>
    </>
  );
}

export default function AdminReset({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useI18n();
  const navigation = useNavigation();
  const refused = actionData as ResetRefusal | undefined;
  const fields = refused?.error.fields;
  const alertRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (refused) alertRef.current?.focus();
  }, [refused]);
  const pending = navigation.state !== "idle" && navigation.formMethod === "POST" && navigation.formAction?.startsWith("/admin/reset") === true;
  if (loaderData.expired || refused?.error.code === "LINK_EXPIRED") {
    return (
      <AuthPage>
        <Expired />
      </AuthPage>
    );
  }
  return (
    <AuthPage>
      <h1>{t("admin.reset.title")}</h1>
      <p className="mt-2 wrap-anywhere">{loaderData.email ? t("admin.reset.intro", { email: loaderData.email }) : t("admin.reset.introNoEmail")}</p>
      {refused && fields && (
        <ErrorSummary ref={alertRef} message={refused.error.message} fields={fields} anchors={{ password: "password" }} title={t("admin.reset.errorSummaryTitle")} />
      )}
      {refused && !fields && (
        <Alert ref={alertRef} tone="danger" role="alert" tabIndex={-1} className="mt-6 outline-offset-2">
          <p className="font-semibold">{refused.error.message}</p>
          {refused.retryAfterMinutes !== undefined && <p className="mt-1">{t("admin.login.retryIn", { count: refused.retryAfterMinutes })}</p>}
        </Alert>
      )}
      <Form method="post" noValidate className="mt-6 grid gap-5">
        {/* Lets password managers save the new password under the right account. */}
        {loaderData.email && <input type="email" name="username" autoComplete="username" defaultValue={loaderData.email} readOnly hidden />}
        <PasswordField
          id="password"
          name="password"
          label={t("admin.reset.password")}
          hint={t("admin.reset.rule")}
          autoComplete="new-password"
          error={fields?.password}
          labels={{ show: t("admin.login.showPassword"), hide: t("admin.login.hidePassword"), shown: t("admin.login.passwordShown"), hidden: t("admin.login.passwordHidden") }}
        />
        <div>
          <SubmitButton pending={pending} pendingText={t("admin.reset.saving")} size="lg" className="w-full">
            {t("admin.reset.submit")}
          </SubmitButton>
        </div>
      </Form>
    </AuthPage>
  );
}
