import { useEffect, useRef } from "react";
import { Form, Link, useNavigation } from "react-router";
import { AuthPage } from "~/components/admin/auth-page";
import { ErrorSummary } from "~/components/checkout/error-summary";
import { Alert } from "~/components/ui/alert";
import { SubmitButton } from "~/components/ui/submit-button";
import { TextField } from "~/components/ui/text-field";
import { t as translate } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import { actionError } from "~/server/action-result.server";
import { adminMiddleware, adminPageLocale } from "~/server/admin-page.server";
import { AUTH_ACTIONS, consumeAuthAttempt, rateLimitedResult } from "~/server/auth-rate-limit.server";
import { authContext } from "~/server/auth-gateway.server";
import type { GuardArgs } from "~/server/auth.server";
import { emailProblem } from "~/server/contracts/admin";
import { requestDbContext } from "~/server/db.server";
import { inBackground } from "~/server/email/context.server";
import { assertSameOrigin } from "~/server/origin.server";
import { findActiveAdminByEmail } from "~/server/repos/admins.server";
import type { Route } from "./+types/forgot";

export const middleware: Route.MiddlewareFunction[] = adminMiddleware;

/** Where the emailed link brings the admin back (contracts.md `admin/forgot`). */
export const RESET_PATH = "/admin/reset";

/** `admin/forgot` (public). */
export function loader(args: Route.LoaderArgs) {
  return { title: translate("admin.forgot.metaTitle", adminPageLocale(args)) };
}

/** Asks Auth for the email; a failure is logged (no address) and never shown (NFR-003). */
async function sendRecovery(args: GuardArgs, email: string): Promise<void> {
  const sent = await args.context.get(authContext).requestRecovery(email, `${args.url.origin}${RESET_PATH}`);
  if (!sent) console.log(JSON.stringify({ level: "error", event: "auth_recovery_request", outcome: "failed" }));
}

/**
 * `admin/forgot` requestReset `{ email }` → `{ ok }` always (S-025). RL-auth counts each
 * well-formed request per email + IP before any lookup. Only an active admin's email gets a
 * link, and it is requested after the response (waitUntil), so known and unknown emails
 * answer the same thing in the same time.
 */
export async function action(args: Route.ActionArgs) {
  assertSameOrigin(args.request);
  const locale = adminPageLocale(args);
  const form = await args.request.formData();
  const email = String(form.get("email") ?? "").trim();
  const values = { email };
  const problem = emailProblem(email);
  if (problem) {
    const message = translate(problem === "missing" ? "admin.forgot.errors.email" : "admin.forgot.errors.emailFormat", locale);
    return actionError("VALIDATION_FAILED", locale, { fields: { email: message }, extra: { values } });
  }
  const limit = await consumeAuthAttempt(args, AUTH_ACTIONS.forgot, email);
  if (!limit.ok) return rateLimitedResult(limit.retryAfterSeconds, locale, { values });
  const admin = await findActiveAdminByEmail(args.context.get(requestDbContext).db, email);
  if (admin) await inBackground(args.context, () => sendRecovery(args, admin.email));
  return { ok: true as const, values };
}

/** Carries the action's `Retry-After` (RATE_LIMITED) onto the response. */
export function headers({ actionHeaders }: Route.HeadersArgs) {
  const retryAfter = actionHeaders.get("Retry-After");
  return retryAfter ? { "Retry-After": retryAfter } : new Headers();
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

type ForgotResult =
  | { ok: true; values: { email: string } }
  | { ok: false; error: { code: string; message: string; fields?: Record<string, string> }; values?: { email?: string }; retryAfterMinutes?: number };

export default function AdminForgot({ actionData }: Route.ComponentProps) {
  const { t } = useI18n();
  const navigation = useNavigation();
  const result = actionData as ForgotResult | undefined;
  const refused = result && !result.ok ? result : undefined;
  const sent = result?.ok === true;
  const alertRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (refused) alertRef.current?.focus();
  }, [refused]);
  const pending = navigation.state !== "idle" && navigation.formMethod === "POST" && navigation.formAction?.startsWith("/admin/forgot") === true;
  return (
    <AuthPage>
      <h1>{t("admin.forgot.title")}</h1>
      <p className="mt-2">{t("admin.forgot.intro")}</p>
      {refused?.error.fields && (
        <ErrorSummary ref={alertRef} message={refused.error.message} fields={refused.error.fields} anchors={{ email: "email" }} title={t("admin.forgot.errorSummaryTitle")} />
      )}
      {refused && !refused.error.fields && (
        <Alert ref={alertRef} tone="danger" role="alert" tabIndex={-1} className="mt-6 outline-offset-2">
          <p className="font-semibold">{refused.error.message}</p>
          {refused.retryAfterMinutes !== undefined && <p className="mt-1">{t("admin.login.retryIn", { count: refused.retryAfterMinutes })}</p>}
        </Alert>
      )}
      {/* Always in the page so the confirmation is announced when it appears (S-025 AC7). */}
      <div role="status" aria-live="polite">
        {sent && (
          <Alert tone="success" className="mt-6">
            <p className="font-semibold">{t("admin.forgot.sent")}</p>
            <p className="mt-1">{t("admin.forgot.sentHint")}</p>
          </Alert>
        )}
      </div>
      <Form method="post" noValidate className="mt-6 grid gap-5">
        <TextField
          id="email"
          name="email"
          type="email"
          label={t("admin.forgot.email")}
          autoComplete="email"
          inputMode="email"
          spellCheck={false}
          autoCapitalize="none"
          defaultValue={result?.values?.email}
          error={refused?.error.fields?.email}
        />
        <div>
          <SubmitButton pending={pending} pendingText={t("admin.forgot.sending")} size="lg" className="w-full">
            {t("admin.forgot.submit")}
          </SubmitButton>
        </div>
      </Form>
      <p className="mt-6">
        <Link to="/admin/login" className="inline-flex min-h-11 items-center font-semibold link">
          {t("admin.forgot.backToSignIn")}
        </Link>
      </p>
    </AuthPage>
  );
}
