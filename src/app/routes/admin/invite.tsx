import { useEffect, useRef } from "react";
import { Form, data, redirect, useNavigation } from "react-router";
import { AuthPage } from "~/components/admin/auth-page";
import { ErrorSummary } from "~/components/checkout/error-summary";
import { Alert } from "~/components/ui/alert";
import { PasswordField } from "~/components/ui/password-field";
import { RadioCard } from "~/components/ui/radio-card";
import { SubmitButton } from "~/components/ui/submit-button";
import { t as translate } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import type { Locale } from "~/lib/locale";
import { actionError } from "~/server/action-result.server";
import { adminMiddleware, adminPageLocale } from "~/server/admin-page.server";
import { invitationLocale, invitationNoReferrer } from "~/server/invite-page.server";
import { AUTH_ACTIONS, clearAuthAttempts, consumeAuthAttempt, rateLimitedResult } from "~/server/auth-rate-limit.server";
import { ADMIN_HOME, LOGIN_PATH, signInAdmin } from "~/server/auth.server";
import { clockContext } from "~/server/clock.server";
import { newPasswordProblem } from "~/server/contracts/admin";
import { requestDbContext } from "~/server/db.server";
import { isInvitationToken } from "~/server/invite-token.server";
import { assertSameOrigin } from "~/server/origin.server";
import { acceptInvitation, findOpenInvitation } from "~/server/services/accept-invite.server";
import { userAdminContext } from "~/server/user-admin.server";
import type { Route } from "./+types/invite";

export const middleware: Route.MiddlewareFunction[] = [...adminMiddleware, invitationNoReferrer, invitationLocale];

/** `admin/invite` (public, token): `{ name, email, role, locale }`, or 410 INVITE_INVALID; a malformed token never reaches the database (AC7). */
export async function loader(args: Route.LoaderArgs) {
  const locale = adminPageLocale(args);
  const title = translate("admin.invite.metaTitle", locale);
  const invalid = () => data({ invalid: true as const, title }, { status: 410 });
  if (!isInvitationToken(args.params.token)) return invalid();
  const invitation = await findOpenInvitation(args.context.get(requestDbContext).db, args.params.token, args.context.get(clockContext).now());
  if (!invitation) return invalid();
  return { invalid: false as const, title: translate("admin.invite.metaTitle", invitation.locale), name: invitation.name, email: invitation.email, role: invitation.role, locale: invitation.locale };
}

const PASSWORD_KEYS = { tooShort: "admin.invite.errors.tooShort", tooLong: "admin.invite.errors.tooLong", weak: "admin.reset.errors.weak" } as const;

function fieldProblems(form: FormData, locale: Locale): Record<string, string> | null {
  const fields: Record<string, string> = {};
  const problem = newPasswordProblem(form.get("password"));
  if (problem) fields.password = translate(PASSWORD_KEYS[problem], locale);
  const chosen = form.get("locale");
  if (chosen !== "en" && chosen !== "fr") fields.locale = translate("admin.invite.errors.locale", locale);
  return Object.keys(fields).length > 0 ? fields : null;
}

/**
 * `accept { password, locale }` (S-029): token shape → fields → RL-auth (per IP) → accept
 * (role, name and email from the invitation only) → sign in with the new password → Today.
 */
export async function action(args: Route.ActionArgs) {
  assertSameOrigin(args.request);
  const locale = adminPageLocale(args);
  const token = args.params.token;
  if (!isInvitationToken(token)) return actionError("INVITE_INVALID", locale);
  const form = await args.request.formData();
  const fields = fieldProblems(form, locale);
  if (fields) return actionError("VALIDATION_FAILED", locale, { fields });
  const limit = await consumeAuthAttempt(args, AUTH_ACTIONS.acceptInvite, "invite");
  if (!limit.ok) return rateLimitedResult(limit.retryAfterSeconds, locale, {});
  const password = String(form.get("password"));
  const chosen = form.get("locale") === "fr" ? "fr" : "en";
  const { context } = args;
  const result = await acceptInvitation(context.get(requestDbContext).db, context.get(userAdminContext), token, { password, locale: chosen }, context.get(clockContext).now());
  if (!result.ok) {
    if (result.code === "WEAK_PASSWORD") return actionError("VALIDATION_FAILED", locale, { fields: { password: translate(PASSWORD_KEYS.weak, locale) } });
    return actionError(result.code, locale);
  }
  await clearAuthAttempts(args, AUTH_ACTIONS.acceptInvite, "invite");
  const signedIn = await signInAdmin(args, { email: result.email, password });
  // The account exists either way; if the sign-in failed, the login page takes it from here.
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

interface AcceptRefusal {
  ok: false;
  error: { code: string; message: string; fields?: Record<string, string> };
  retryAfterMinutes?: number;
}

/** Heading that takes focus on load (S-029 AC8), not a Tab stop. */
function FocusedTitle({ children }: { children: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <h1 ref={ref} tabIndex={-1} className="outline-none">
      {children}
    </h1>
  );
}

function Invalid({ message }: { message: string }) {
  const { t } = useI18n();
  return (
    <AuthPage>
      <FocusedTitle>{t("admin.invite.invalidTitle")}</FocusedTitle>
      <Alert tone="warning" role="alert" className="mt-6">
        <p className="font-semibold">{message}</p>
      </Alert>
    </AuthPage>
  );
}

function Details({ name, email, role }: { name: string; email: string; role: "owner" | "admin" }) {
  const { t } = useI18n();
  return (
    <dl className="mt-6 grid gap-3">
      {[
        [t("admin.invite.name"), name],
        [t("admin.invite.email"), email],
        [t("admin.invite.role"), t(`admin.shell.role.${role}`)],
      ].map(([term, value]) => (
        <div key={term}>
          <dt className="font-semibold">{term}</dt>
          <dd className="wrap-anywhere">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function RefusalNotice({ refused, alertRef }: { refused: AcceptRefusal; alertRef: React.RefObject<HTMLDivElement | null> }) {
  const { t } = useI18n();
  if (refused.error.fields) {
    return (
      <ErrorSummary ref={alertRef} message={refused.error.message} fields={refused.error.fields} anchors={{ password: "password", locale: "locale-en" }} title={t("admin.invite.errorSummaryTitle")} />
    );
  }
  return (
    <Alert ref={alertRef} tone="danger" role="alert" tabIndex={-1} className="mt-6 outline-offset-2">
      <p className="font-semibold">{refused.error.message}</p>
      {refused.retryAfterMinutes !== undefined && <p className="mt-1">{t("admin.login.retryIn", { count: refused.retryAfterMinutes })}</p>}
    </Alert>
  );
}

export default function AdminInvite({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useI18n();
  const navigation = useNavigation();
  const refused = actionData as AcceptRefusal | undefined;
  const alertRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (refused) alertRef.current?.focus();
  }, [refused]);
  if (loaderData.invalid || refused?.error.code === "INVITE_INVALID") return <Invalid message={t("errors.codes.INVITE_INVALID")} />;
  const pending = navigation.state !== "idle" && navigation.formMethod === "POST";
  const fields = refused?.error.fields;
  return (
    <AuthPage>
      <FocusedTitle>{t("admin.invite.title")}</FocusedTitle>
      <p className="mt-2">{t("admin.invite.intro")}</p>
      <Details name={loaderData.name} email={loaderData.email} role={loaderData.role} />
      {refused && <RefusalNotice refused={refused} alertRef={alertRef} />}
      <Form method="post" noValidate className="mt-6 grid gap-5">
        {/* Lets password managers save the new password under the right account. */}
        <input type="email" name="username" autoComplete="username" defaultValue={loaderData.email} readOnly hidden />
        <PasswordField
          id="password"
          name="password"
          label={t("admin.invite.password")}
          hint={t("admin.invite.rule")}
          autoComplete="new-password"
          error={fields?.password}
          labels={{ show: t("admin.login.showPassword"), hide: t("admin.login.hidePassword"), shown: t("admin.login.passwordShown"), hidden: t("admin.login.passwordHidden") }}
        />
        <fieldset className="min-w-0" aria-describedby={fields?.locale ? "locale-error" : undefined}>
          <legend className="font-semibold">{t("admin.invite.language")}</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <RadioCard id="locale-en" name="locale" value="en" title={t("admin.profile.english")} defaultChecked={loaderData.locale === "en"} />
            <RadioCard id="locale-fr" name="locale" value="fr" title={t("admin.profile.french")} defaultChecked={loaderData.locale === "fr"} />
          </div>
          {fields?.locale && (
            <p id="locale-error" className="mt-1 font-semibold text-destructive">
              {fields.locale}
            </p>
          )}
        </fieldset>
        <div>
          <SubmitButton pending={pending} pendingText={t("admin.invite.submitting")} size="lg" className="w-full">
            {t("admin.invite.submit")}
          </SubmitButton>
        </div>
      </Form>
    </AuthPage>
  );
}
