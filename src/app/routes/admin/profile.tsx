import { type RefObject, useCallback, useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import { AdminErrorBoundary } from "~/components/admin/admin-states";
import { PushDevice } from "~/components/admin/push-device";
import { ErrorSummary } from "~/components/checkout/error-summary";
import { Alert } from "~/components/ui/alert";
import { PasswordField } from "~/components/ui/password-field";
import { RadioCard } from "~/components/ui/radio-card";
import { SubmitButton } from "~/components/ui/submit-button";
import { SwitchField } from "~/components/ui/switch-field";
import { TextField } from "~/components/ui/text-field";
import { t as translate } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import type { Locale } from "~/lib/locale";
import { actionError } from "~/server/action-result.server";
import { authContext, endOtherSessions } from "~/server/auth-gateway.server";
import { AUTH_ACTIONS, clearAuthAttempts, consumeAuthAttempt, rateLimitedResult } from "~/server/auth-rate-limit.server";
import { type AdminUser, requireAdmin } from "~/server/auth.server";
import { PROFILE_NAME_MAX } from "~/domain/admin-account";
import { ProfileInput, PushEndpointInput, newPasswordProblem, parseAlerts, parsePushSubscription } from "~/server/contracts/admin";
import { clockContext } from "~/server/clock.server";
import { requestDbContext } from "~/server/db.server";
import { testPushPayload } from "~/server/notify/push-text.server";
import { pushContext, removeOwnSubscription, sendPushes } from "~/server/push/push.server";
import { devicesOf, saveSubscription } from "~/server/push/subscriptions.server";
import { readProfile, setAlerts, updateProfile } from "~/server/repos/admins.server";
import type { Route } from "./+types/profile";

/** `admin/profile` (admin): My profile (S-036, FR-046). */
export const handle = { titleKey: "admin.nav.profile" };

/** Own data only: the id comes from the session, never from the URL or the form (AC5). */
export async function loader(args: Route.LoaderArgs) {
  const me = await requireAdmin(args);
  const profile = await readProfile(args.context.get(requestDbContext).db, me.id);
  if (!profile) throw new Response(null, { status: 404 });
  // The browser needs the VAPID public key to subscribe; null = push not configured (S-197).
  return { title: translate(handle.titleKey, me.locale), ...profile, push: { publicKey: args.context.get(pushContext).publicKey } };
}

type Intent = "updateProfile" | "changePassword" | "setAlerts" | "subscribePush" | "unsubscribePush" | "sendTestPush";

const fieldError = (intent: Intent, locale: Locale, fields: Record<string, string>) =>
  actionError("VALIDATION_FAILED", locale, { fields: Object.fromEntries(Object.entries(fields).map(([k, key]) => [k, translate(key, locale)])), extra: { intent } });

async function saveProfile(args: Route.ActionArgs, me: AdminUser, form: FormData) {
  const parsed = ProfileInput.safeParse({ name: form.get("name"), locale: form.get("locale") });
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[String(issue.path[0])] = `admin.profile.errors.${String(issue.path[0])}`;
    return fieldError("updateProfile", me.locale, fields);
  }
  await updateProfile(args.context.get(requestDbContext).db, me.id, parsed.data);
  return { ok: true as const, intent: "updateProfile" as const };
}

/**
 * changePassword: the current password is checked first (a 30-day session on a lost phone
 * must not be enough to take the account), RL-auth counts each check, and the session
 * on this device stays signed in (AC3) while every other device is signed out (lead
 * decision 2026-11-12).
 */
async function changePassword(args: Route.ActionArgs, me: AdminUser, form: FormData) {
  const intent = "changePassword" as const;
  const current = String(form.get("currentPassword") ?? "");
  const password = String(form.get("password") ?? "");
  const problem = newPasswordProblem(password);
  const fields: Record<string, string> = {};
  if (current === "") fields.currentPassword = "admin.profile.errors.currentPassword";
  if (problem) fields.password = `admin.profile.errors.${problem}`;
  if (Object.keys(fields).length > 0) return fieldError(intent, me.locale, fields);
  const limit = await consumeAuthAttempt(args, AUTH_ACTIONS.changePassword, me.email);
  if (!limit.ok) return rateLimitedResult(limit.retryAfterSeconds, me.locale, { intent });
  const gateway = args.context.get(authContext);
  if (!(await gateway.checkPassword({ email: me.email, password: current }))) return fieldError(intent, me.locale, { currentPassword: "admin.profile.errors.currentPassword" });
  const update = await gateway.updatePassword(password);
  if (!update.ok) return update.reason === "weak" ? fieldError(intent, me.locale, { password: "admin.profile.errors.weak" }) : actionError("INTERNAL", me.locale, { extra: { intent } });
  await clearAuthAttempts(args, AUTH_ACTIONS.changePassword, me.email);
  await endOtherSessions(gateway, "profile");
  return { ok: true as const, intent };
}

/** subscribePush (S-196 AC1, AC5): this browser, for the session's admin only. */
async function subscribePush(args: Route.ActionArgs, me: AdminUser, form: FormData) {
  const parsed = parsePushSubscription(form);
  if (!parsed.success) return actionError("VALIDATION_FAILED", me.locale, { extra: { intent: "subscribePush" } });
  await saveSubscription(args.context.get(requestDbContext).db, me.id, parsed.data, args.request.headers.get("user-agent"));
  return { ok: true as const, intent: "subscribePush" as const };
}

/** unsubscribePush (S-196 AC10): only the caller's own row; any other endpoint is a quiet no-op. */
async function unsubscribePush(args: Route.ActionArgs, me: AdminUser, form: FormData) {
  const parsed = PushEndpointInput.safeParse({ endpoint: form.get("endpoint") });
  if (!parsed.success) return actionError("VALIDATION_FAILED", me.locale, { extra: { intent: "unsubscribePush" } });
  await removeOwnSubscription(args.context.get(requestDbContext).db, me.id, parsed.data.endpoint);
  return { ok: true as const, intent: "unsubscribePush" as const };
}

/** sendTestPush (S-196 AC2): the caller's own devices; waits (5 s at most each) so the screen can say how many. */
async function sendTestPush(args: Route.ActionArgs, me: AdminUser) {
  const intent = "sendTestPush" as const;
  const { pusher } = args.context.get(pushContext);
  if (!pusher) return { ok: true as const, intent, sent: 0, configured: false as const };
  const db = args.context.get(requestDbContext).db;
  const payload = testPushPayload(me.locale, me.id);
  const devices = await devicesOf(db, me.id);
  const report = await sendPushes(db, pusher, "test", devices.map((device) => ({ device, payload })), args.context.get(clockContext).now());
  return { ok: true as const, intent, sent: report.sent };
}

export async function action(args: Route.ActionArgs) {
  const me = await requireAdmin(args);
  const form = await args.request.formData();
  const intent = form.get("intent");
  if (intent === "updateProfile") return saveProfile(args, me, form);
  if (intent === "changePassword") return changePassword(args, me, form);
  if (intent === "setAlerts") {
    await setAlerts(args.context.get(requestDbContext).db, me.id, parseAlerts(form));
    return { ok: true as const, intent };
  }
  if (intent === "subscribePush") return subscribePush(args, me, form);
  if (intent === "unsubscribePush") return unsubscribePush(args, me, form);
  if (intent === "sendTestPush") return sendTestPush(args, me);
  return actionError("VALIDATION_FAILED", me.locale);
}

/** Carries the action's `Retry-After` (RATE_LIMITED) onto the response. */
export function headers({ actionHeaders }: Route.HeadersArgs) {
  const retryAfter = actionHeaders.get("Retry-After");
  return retryAfter ? { "Retry-After": retryAfter } : new Headers();
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

export const ErrorBoundary = AdminErrorBoundary;

type SectionResult =
  | { ok: true; intent: Intent }
  | { ok: false; intent?: Intent; error: { code: string; message: string; fields?: Record<string, string> }; retryAfterMinutes?: number };

/** One section's form: a keyed fetcher (stays on the page), with the plain post's answer as a fallback. */
function useSection(intent: Intent, actionData: unknown) {
  const fetcher = useFetcher<SectionResult>({ key: `profile-${intent}` });
  const fallback = actionData as SectionResult | undefined;
  const result = fetcher.data ?? (fallback?.intent === intent ? fallback : undefined);
  const refused = result && !result.ok ? result : undefined;
  const summaryRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (refused) summaryRef.current?.focus();
  }, [refused]);
  return { fetcher, result, refused, summaryRef, pending: fetcher.state !== "idle" };
}

function Refusal({ refused, anchors, summaryRef }: { refused?: Extract<SectionResult, { ok: false }>; anchors: Record<string, string>; summaryRef: RefObject<HTMLDivElement | null> }) {
  const { t } = useI18n();
  if (!refused) return null;
  if (refused.error.fields) {
    return <ErrorSummary ref={summaryRef} message={refused.error.message} fields={refused.error.fields} anchors={anchors} title={t("admin.profile.errorSummaryTitle")} />;
  }
  return (
    <Alert ref={summaryRef} tone="danger" role="alert" tabIndex={-1} className="mt-4 outline-offset-2">
      <p className="font-semibold">{refused.error.message}</p>
      {refused.retryAfterMinutes !== undefined && <p className="mt-1">{t("admin.login.retryIn", { count: refused.retryAfterMinutes })}</p>}
    </Alert>
  );
}

/** Runs `onSaved` once per successful answer (the result itself shows in the row's live region). */
function useOnSaved(result: SectionResult | undefined, onSaved: () => void) {
  const seen = useRef<SectionResult | undefined>(undefined);
  useEffect(() => {
    if (result?.ok && seen.current !== result) {
      seen.current = result;
      onSaved();
    }
  }, [result, onSaved]);
}

type Profile = Route.ComponentProps["loaderData"];

function DetailsSection({ profile, actionData }: { profile: Profile; actionData: unknown }) {
  const { t } = useI18n();
  const { fetcher, result, refused, summaryRef, pending } = useSection("updateProfile", actionData);
  const fields = refused?.error.fields;
  return (
    <section aria-labelledby="details-title" className="rounded-card border border-border bg-card p-2 min-[20rem]:p-4 sm:p-6">
      <h2 id="details-title">{t("admin.profile.detailsTitle")}</h2>
      <Refusal refused={refused} anchors={{ name: "name", locale: "locale-en" }} summaryRef={summaryRef} />
      <fetcher.Form method="post" noValidate className="mt-4 grid gap-5">
        <input type="hidden" name="intent" value="updateProfile" />
        <TextField id="name" name="name" label={t("admin.profile.name")} autoComplete="name" maxLength={PROFILE_NAME_MAX} defaultValue={profile.name} error={fields?.name} />
        <div>
          <p className="font-semibold">{t("admin.profile.email")}</p>
          <p className="mt-1 wrap-anywhere">{profile.email}</p>
          <p className="text-sm text-muted-foreground">{t("admin.profile.emailHint")}</p>
        </div>
        <fieldset className="min-w-0" aria-describedby={fields?.locale ? "locale-error" : undefined}>
          <legend className="font-semibold">{t("admin.profile.language")}</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <RadioCard id="locale-en" name="locale" value="en" title={t("admin.profile.english")} defaultChecked={profile.locale === "en"} />
            <RadioCard id="locale-fr" name="locale" value="fr" title={t("admin.profile.french")} defaultChecked={profile.locale === "fr"} />
          </div>
          {fields?.locale && (
            <p id="locale-error" className="mt-1 font-semibold text-destructive">
              {fields.locale}
            </p>
          )}
        </fieldset>
        <SaveRow pending={pending} saved={result?.ok === true} label={t("admin.profile.save")} pendingText={t("admin.profile.saving")} />
      </fetcher.Form>
    </section>
  );
}

function SaveRow({ pending, saved, label, pendingText, savedText }: { pending: boolean; saved: boolean; label: string; pendingText: string; savedText?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <SubmitButton pending={pending} pendingText={pendingText} size="lg" className="w-full sm:w-auto">
        {label}
      </SubmitButton>
      <p role="status" aria-live="polite" className="font-semibold">
        {saved && !pending ? (savedText ?? t("admin.profile.saved")) : ""}
      </p>
    </div>
  );
}

function PasswordSection({ profile, actionData }: { profile: Profile; actionData: unknown }) {
  const { t } = useI18n();
  const formRef = useRef<HTMLFormElement>(null);
  const clearForm = useCallback(() => formRef.current?.reset(), []);
  const { fetcher, result, refused, summaryRef, pending } = useSection("changePassword", actionData);
  useOnSaved(result, clearForm);
  const fields = refused?.error.fields;
  const toggle = { show: t("admin.login.showPassword"), hide: t("admin.login.hidePassword"), shown: t("admin.login.passwordShown"), hidden: t("admin.login.passwordHidden") };
  return (
    <section aria-labelledby="password-title" className="rounded-card border border-border bg-card p-2 min-[20rem]:p-4 sm:p-6">
      <h2 id="password-title">{t("admin.profile.passwordTitle")}</h2>
      <Refusal refused={refused} anchors={{ currentPassword: "currentPassword", password: "newPassword" }} summaryRef={summaryRef} />
      <fetcher.Form ref={formRef} method="post" noValidate className="mt-4 grid gap-5">
        <input type="hidden" name="intent" value="changePassword" />
        <input type="email" name="username" autoComplete="username" defaultValue={profile.email} readOnly hidden />
        <PasswordField id="currentPassword" name="currentPassword" label={t("admin.profile.currentPassword")} autoComplete="current-password" error={fields?.currentPassword} labels={toggle} />
        <PasswordField id="newPassword" name="password" label={t("admin.profile.newPassword")} hint={t("admin.profile.rule")} autoComplete="new-password" error={fields?.password} labels={toggle} />
        <SaveRow pending={pending} saved={result?.ok === true} label={t("admin.profile.changePassword")} pendingText={t("admin.profile.changingPassword")} savedText={t("admin.profile.passwordChanged")} />
      </fetcher.Form>
    </section>
  );
}

function AlertsSection({ profile, actionData }: { profile: Profile; actionData: unknown }) {
  const { t } = useI18n();
  const { fetcher, result, refused, summaryRef, pending } = useSection("setAlerts", actionData);
  return (
    <section aria-labelledby="alerts-title" className="rounded-card border border-border bg-card p-2 min-[20rem]:p-4 sm:p-6">
      <h2 id="alerts-title">{t("admin.profile.alertsTitle")}</h2>
      <p className="mt-1">{t("admin.profile.alertsIntro")}</p>
      <Refusal refused={refused} anchors={{}} summaryRef={summaryRef} />
      <fetcher.Form method="post" className="mt-4 grid gap-4">
        <input type="hidden" name="intent" value="setAlerts" />
        <SwitchField id="alertPush" name="alertPush" label={t("admin.profile.alertPush")} hint={t("admin.profile.alertPushHint")} defaultChecked={profile.alertPush} />
        <SwitchField id="alertEmail" name="alertEmail" label={t("admin.profile.alertEmail")} hint={t("admin.profile.alertEmailHint", { email: profile.email })} defaultChecked={profile.alertEmail} />
        <SaveRow pending={pending} saved={result?.ok === true} label={t("admin.profile.saveAlerts")} pendingText={t("admin.profile.saving")} />
      </fetcher.Form>
      <div className="mt-6">
        <PushDevice serverKey={profile.push.publicKey} devices={profile.pushDevices} />
      </div>
    </section>
  );
}

export default function AdminProfile({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useI18n();
  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <h1>{t("admin.profile.title")}</h1>
      <DetailsSection profile={loaderData} actionData={actionData} />
      <PasswordSection profile={loaderData} actionData={actionData} />
      <AlertsSection profile={loaderData} actionData={actionData} />
    </div>
  );
}
