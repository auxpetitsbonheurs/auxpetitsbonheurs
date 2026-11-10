import { useEffect, useRef } from "react";
import { Form, redirect, useNavigation } from "react-router";
import { AdminHeader } from "~/components/admin/admin-header";
import { ErrorSummary } from "~/components/checkout/error-summary";
import { SkipLink } from "~/components/shell/skip-link";
import { Alert } from "~/components/ui/alert";
import { PasswordField } from "~/components/ui/password-field";
import { SubmitButton } from "~/components/ui/submit-button";
import { TextField } from "~/components/ui/text-field";
import { t as translate } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import type { Locale } from "~/lib/locale";
import { actionError } from "~/server/action-result.server";
import { adminMiddleware, adminPageLocale } from "~/server/admin-page.server";
import { adminSession, safeNext, signInAdmin, signInAllowed } from "~/server/auth.server";
import { type SignInField, signInProblems } from "~/server/contracts/admin";
import { assertSameOrigin } from "~/server/origin.server";
import type { Route } from "./+types/login";

export const middleware: Route.MiddlewareFunction[] = adminMiddleware;

/** `admin/login` loader (public): a signed-in admin goes straight on to `next`. */
export async function loader(args: Route.LoaderArgs) {
  const next = safeNext(args.url.searchParams.get("next"));
  const session = await adminSession(args);
  if (session.status === "admin") throw redirect(next);
  return { next, title: translate("admin.login.metaTitle", adminPageLocale(args)) };
}

const FIELD_MESSAGES: Record<SignInField, Record<"missing" | "format", string>> = {
  email: { missing: "admin.login.errors.email", format: "admin.login.errors.emailFormat" },
  password: { missing: "admin.login.errors.password", format: "admin.login.errors.password" },
};

function fieldErrors(problems: ReturnType<typeof signInProblems>, locale: Locale): Record<string, string> {
  return Object.fromEntries(
    (Object.entries(problems) as [SignInField, "missing" | "format"][]).map(([field, kind]) => [field, translate(FIELD_MESSAGES[field][kind], locale)]),
  );
}

/** `admin/login` signIn: one generic refusal for every credential problem (FR-040, NFR-003). */
export async function action(args: Route.ActionArgs) {
  assertSameOrigin(args.request);
  const locale = adminPageLocale(args);
  const form = Object.fromEntries(await args.request.formData());
  const email = typeof form.email === "string" ? form.email.trim() : "";
  const values = { email };
  const problems = signInProblems(form);
  if (Object.keys(problems).length > 0) return actionError("VALIDATION_FAILED", locale, { fields: fieldErrors(problems, locale), extra: { values } });
  if (!signInAllowed()) return actionError("RATE_LIMITED", locale, { extra: { values } });
  const result = await signInAdmin(args, { email: email.toLowerCase(), password: String(form.password) });
  if (!result.ok) return actionError("INVALID_CREDENTIALS", locale, { extra: { values } });
  return redirect(safeNext(form.next), { headers: result.headers });
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

const ANCHORS = { email: "email", password: "password" };

interface LoginRefusal {
  ok: false;
  error: { code: string; message: string; fields?: Record<string, string> };
  values?: { email?: string };
}

export default function AdminLogin({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useI18n();
  const navigation = useNavigation();
  const refused = actionData as LoginRefusal | undefined;
  const fields = refused?.error.fields;
  const alertRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (refused) alertRef.current?.focus();
  }, [refused]);
  const pending = navigation.state !== "idle" && navigation.formMethod === "POST" && navigation.formAction?.startsWith("/admin/login") === true;
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <AdminHeader />
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-md flex-1 px-4 py-8 outline-none">
        <h1>{t("admin.login.title")}</h1>
        <p className="mt-2">{t("admin.login.intro")}</p>
        {refused && fields && (
          <ErrorSummary ref={alertRef} message={refused.error.message} fields={fields} anchors={ANCHORS} title={t("admin.login.errorSummaryTitle")} />
        )}
        {refused && !fields && (
          <Alert ref={alertRef} tone="danger" role="alert" tabIndex={-1} className="mt-6 outline-offset-2">
            <p className="font-semibold">{refused.error.message}</p>
          </Alert>
        )}
        <Form method="post" noValidate className="mt-6 grid gap-5">
          <input type="hidden" name="next" value={loaderData.next} />
          <TextField
            id="email"
            name="email"
            type="email"
            label={t("admin.login.email")}
            autoComplete="username"
            inputMode="email"
            spellCheck={false}
            autoCapitalize="none"
            defaultValue={refused?.values?.email}
            error={fields?.email}
          />
          <PasswordField
            id="password"
            name="password"
            label={t("admin.login.password")}
            autoComplete="current-password"
            error={fields?.password}
            labels={{ show: t("admin.login.showPassword"), hide: t("admin.login.hidePassword"), shown: t("admin.login.passwordShown"), hidden: t("admin.login.passwordHidden") }}
          />
          <div>
            <SubmitButton pending={pending} pendingText={t("admin.login.signingIn")} size="lg" className="w-full">
              {t("admin.login.submit")}
            </SubmitButton>
          </div>
        </Form>
      </main>
    </div>
  );
}
