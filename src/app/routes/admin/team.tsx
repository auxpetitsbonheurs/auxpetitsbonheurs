import { type ShouldRevalidateFunctionArgs, data, isRouteErrorResponse, useRevalidator, useRouteError } from "react-router";
import { AdminErrorBoundary } from "~/components/admin/admin-states";
import { TeamScreen } from "~/components/admin/team-screen";
import { Alert } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { DomainError } from "~/domain/errors";
import { formatClockTime, formatDayLabel, todayMU } from "~/domain/time";
import { t as translate } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import type { Locale } from "~/lib/locale";
import { actionError } from "~/server/action-result.server";
import { afterResponseContext } from "~/server/after-response.server";
import { type AdminUser, requireAdmin } from "~/server/auth.server";
import { clockContext } from "~/server/clock.server";
import { AdminIdInput, ChangeRoleInput, InviteIdInput, InviteInput } from "~/server/contracts/admin";
import { requestDbContext } from "~/server/db.server";
import { emailContext } from "~/server/email/context.server";
import { deliverInvitation } from "~/server/email/outbox.server";
import { listTeam } from "~/server/repos/invitations.server";
import { timed } from "~/server/server-timing.server";
import { changeRole } from "~/server/services/change-role.server";
import { banUser, deactivateAdmin, reactivateAdmin } from "~/server/services/deactivate-admin.server";
import { type InviteContext, type Queued, inviteAdmin, resendInvite, revokeInvite } from "~/server/services/invite-admin.server";
import { userAdminContext } from "~/server/user-admin.server";
import type { Route } from "./+types/team";

/** `admin/team` (**owner**, FR-042): admins and open invitations (S-027), invite (S-028), resend and revoke (S-030). */
export const handle = { titleKey: "admin.nav.team" };

/** "Thu 12 Nov 14:05" / "jeu. 12 nov. 14:05" in Mauritius time. */
const signInLabel = (at: Date, locale: Locale) => `${formatDayLabel(todayMU(at), locale)} ${formatClockTime(at)}`;

export async function loader(args: Route.LoaderArgs) {
  const me = await requireAdmin(args, { role: "owner" });
  const { context } = args;
  const team = await timed(context, "team", () => listTeam(context.get(requestDbContext).db, context.get(clockContext).now()));
  const emailReady = context.get(emailContext).mailer !== null;
  return {
    title: translate(handle.titleKey, me.locale),
    meId: me.id,
    admins: team.admins.map(({ lastSignInAt, ...row }) => ({ ...row, lastSignIn: lastSignInAt ? signInLabel(lastSignInAt, me.locale) : null })),
    invites: team.invites.map(({ expiresAt, emailFailed, ...row }) => ({
      ...row,
      validUntil: formatDayLabel(todayMU(expiresAt), me.locale),
      // Without Resend nothing can leave; a failed or dead email asks for Resend (S-028 AC3).
      emailNotSent: emailFailed || !emailReady,
    })),
  };
}

type Intent = "invite" | "resendInvite" | "revokeInvite" | "changeRole" | "deactivate" | "reactivate";
const FIELD_KEYS = { name: "admin.team.errors.name", email: "admin.team.errors.email", role: "admin.team.errors.role", locale: "admin.team.errors.locale" } as const;

const refusal = (code: Parameters<typeof actionError>[0], intent: Intent, locale: Locale, fields?: Record<string, string>) =>
  actionError(code, locale, { ...(fields ? { fields } : {}), extra: { intent } });

/** Sends the invitation email after the response (S-028 AC2); `emailQueued` says whether a sender exists. */
function sendAfterResponse(args: Route.ActionArgs, queued: Queued): boolean {
  const { context } = args;
  const email = context.get(emailContext);
  const db = context.get(requestDbContext).db;
  const now = context.get(clockContext).now();
  context.get(afterResponseContext).defer("invitation_email", () => deliverInvitation(db, email.mailer, queued.outboxId, { now, timeoutMs: email.timeoutMs }));
  return email.mailer !== null;
}

function inviteContext(args: Route.ActionArgs, me: AdminUser): InviteContext {
  return { now: args.context.get(clockContext).now(), inviter: { id: me.id, name: me.name }, origin: new URL(args.request.url).origin };
}

async function invite(args: Route.ActionArgs, me: AdminUser, form: FormData) {
  const text = (name: string) => String(form.get(name) ?? "");
  // The email is trimmed before its format check (a pasted address often ends in a space).
  const parsed = InviteInput.safeParse({ name: text("name"), email: text("email").trim(), role: text("role"), locale: text("locale") });
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0]) as keyof typeof FIELD_KEYS;
      fields[field] = translate(FIELD_KEYS[field], me.locale);
    }
    return refusal("VALIDATION_FAILED", "invite", me.locale, fields);
  }
  const result = await inviteAdmin(args.context.get(requestDbContext).db, parsed.data, inviteContext(args, me));
  if (!result.ok) {
    const message = result.deactivated ? translate("admin.team.errors.emailInUseDeactivated", me.locale) : translate("errors.codes.EMAIL_IN_USE", me.locale);
    return refusal("EMAIL_IN_USE", "invite", me.locale, { email: message });
  }
  console.log(JSON.stringify({ level: "info", event: "admin_invited", role: parsed.data.role }));
  return { ok: true as const, intent: "invite" as const, email: result.email, emailQueued: sendAfterResponse(args, result) };
}

async function changeInvite(args: Route.ActionArgs, me: AdminUser, form: FormData, intent: "resendInvite" | "revokeInvite") {
  const parsed = InviteIdInput.safeParse({ id: form.get("id") });
  if (!parsed.success) return refusal("VALIDATION_FAILED", intent, me.locale);
  const db = args.context.get(requestDbContext).db;
  if (intent === "revokeInvite") {
    const revoked = await revokeInvite(db, parsed.data.id, args.context.get(clockContext).now());
    if (!revoked.ok) return refusal(revoked.code, intent, me.locale);
    console.log(JSON.stringify({ level: "info", event: "admin_invite_revoked" }));
    return { ok: true as const, intent, email: revoked.email };
  }
  const resent = await resendInvite(db, parsed.data.id, inviteContext(args, me));
  if (!resent.ok) return refusal(resent.code, intent, me.locale);
  console.log(JSON.stringify({ level: "info", event: "admin_invite_resent" }));
  return { ok: true as const, intent, email: resent.email, emailQueued: sendAfterResponse(args, resent) };
}

/** NOT_FOUND / LAST_OWNER / FORBIDDEN from a Team change, as the envelope plus `intent`; anything else is rethrown. */
function teamRefusal(error: unknown, intent: Intent, locale: Locale) {
  if (error instanceof DomainError && (error.code === "NOT_FOUND" || error.code === "LAST_OWNER" || error.code === "FORBIDDEN")) return refusal(error.code, intent, locale);
  throw error;
}

/** changeRole (S-031): `{ ok, intent, adminId, name, role, self }`; `self` lets the page leave Team after a self-demotion. */
async function changeRoleOf(args: Route.ActionArgs, me: AdminUser, form: FormData) {
  const parsed = ChangeRoleInput.safeParse({ adminId: form.get("adminId"), role: form.get("role") });
  if (!parsed.success) return refusal("VALIDATION_FAILED", "changeRole", me.locale);
  try {
    const changed = await changeRole(args.context.get(requestDbContext).db, { actorId: me.id, ...parsed.data });
    return { ok: true as const, intent: "changeRole" as const, adminId: parsed.data.adminId, name: changed.name, role: changed.to, self: changed.self };
  } catch (error) {
    return teamRefusal(error, "changeRole", me.locale);
  }
}

/**
 * deactivate (S-032): `{ ok, intent, adminId, name, self, signOutPending }`. Access is blocked
 * in the database before the Auth ban; when the ban fails (AC8) it is tried once more after
 * the response, `signOutPending` tells the Owner, and Retry repeats the action safely.
 */
async function deactivate(args: Route.ActionArgs, me: AdminUser, adminId: string) {
  const { context } = args;
  const users = context.get(userAdminContext);
  try {
    const done = await deactivateAdmin(context.get(requestDbContext).db, users, { actorId: me.id, adminId, now: context.get(clockContext).now() });
    if (!done.banned) context.get(afterResponseContext).defer("admin_ban_retry", async () => void (await banUser(users, adminId)));
    return { ok: true as const, intent: "deactivate" as const, adminId, name: done.name, self: done.self, signOutPending: !done.banned };
  } catch (error) {
    return teamRefusal(error, "deactivate", me.locale);
  }
}

/** reactivate (S-032 AC6): `{ ok, intent, adminId, name }`; Auth unreachable → INTERNAL 500, nothing changed. */
async function reactivate(args: Route.ActionArgs, me: AdminUser, adminId: string) {
  const { context } = args;
  try {
    const done = await reactivateAdmin(context.get(requestDbContext).db, context.get(userAdminContext), { actorId: me.id, adminId, now: context.get(clockContext).now() });
    if (done.ok) return { ok: true as const, intent: "reactivate" as const, adminId, name: done.name };
    const message = translate("admin.team.reactivateFailed", me.locale, { name: done.name });
    return data({ ok: false as const, intent: "reactivate" as const, error: { code: "INTERNAL" as const, message } }, { status: 500 });
  } catch (error) {
    return teamRefusal(error, "reactivate", me.locale);
  }
}

async function changeAccess(args: Route.ActionArgs, me: AdminUser, form: FormData, intent: "deactivate" | "reactivate") {
  const parsed = AdminIdInput.safeParse({ adminId: form.get("adminId") });
  if (!parsed.success) return refusal("VALIDATION_FAILED", intent, me.locale);
  return intent === "deactivate" ? deactivate(args, me, parsed.data.adminId) : reactivate(args, me, parsed.data.adminId);
}

/** Owners only: an Admin gets FORBIDDEN before the form is read (S-022). */
export async function action(args: Route.ActionArgs) {
  const me = await requireAdmin(args, { role: "owner" });
  const form = await args.request.formData();
  const intent = form.get("intent");
  if (intent === "invite") return invite(args, me, form);
  if (intent === "resendInvite" || intent === "revokeInvite") return changeInvite(args, me, form, intent);
  if (intent === "changeRole") return changeRoleOf(args, me, form);
  if (intent === "deactivate" || intent === "reactivate") return changeAccess(args, me, form, intent);
  return actionError("VALIDATION_FAILED", me.locale);
}

/**
 * After an Owner made themselves Admin the Team page is no longer theirs: its loader is not
 * re-run (it would answer 403 under the open dialog); the frame still refreshes and the
 * dialog takes them to Today. Everything else keeps the default.
 */
export function shouldRevalidate({ actionResult, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  const result = actionResult as { intent?: unknown; self?: unknown } | undefined;
  if (result?.intent === "changeRole" && result.self === true) return false;
  return defaultShouldRevalidate;
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

/** Load failure (S-027 AC5): the heading stays and Retry reloads; 403 is the Owner-only state. */
export function ErrorBoundary(props: Route.ErrorBoundaryProps) {
  const error = useRouteError();
  const { t } = useI18n();
  const revalidator = useRevalidator();
  if (isRouteErrorResponse(error) && [401, 403, 404].includes(error.status)) return <AdminErrorBoundary error={props.error} />;
  return (
    <>
      <h1>{t("admin.team.title")}</h1>
      <Alert tone="danger" role="alert" title={t("admin.team.loadFailedTitle")} className="mt-6">
        <p>{t("admin.team.loadFailedBody")}</p>
        <Button type="button" variant="outline" className="mt-3" onClick={() => void revalidator.revalidate()} aria-busy={revalidator.state === "loading" || undefined}>
          {t("admin.states.retry")}
        </Button>
      </Alert>
    </>
  );
}

export default function AdminTeam({ loaderData }: Route.ComponentProps) {
  return <TeamScreen team={loaderData} />;
}
