import { isRouteErrorResponse, useRevalidator, useRouteError } from "react-router";
import { AdminErrorBoundary } from "~/components/admin/admin-states";
import { TeamScreen } from "~/components/admin/team-screen";
import { Alert } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { formatClockTime, formatDayLabel, todayMU } from "~/domain/time";
import { t as translate } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import type { Locale } from "~/lib/locale";
import { actionError } from "~/server/action-result.server";
import { afterResponseContext } from "~/server/after-response.server";
import { type AdminUser, requireAdmin } from "~/server/auth.server";
import { clockContext } from "~/server/clock.server";
import { InviteIdInput, InviteInput } from "~/server/contracts/admin";
import { requestDbContext } from "~/server/db.server";
import { emailContext } from "~/server/email/context.server";
import { deliverInvitation } from "~/server/email/outbox.server";
import { listTeam } from "~/server/repos/invitations.server";
import { timed } from "~/server/server-timing.server";
import { type InviteContext, type Queued, inviteAdmin, resendInvite, revokeInvite } from "~/server/services/invite-admin.server";
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

type Intent = "invite" | "resendInvite" | "revokeInvite";
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

/** Owners only: an Admin gets FORBIDDEN before the form is read (S-022). Role changes and deactivation arrive with S-031/S-032. */
export async function action(args: Route.ActionArgs) {
  const me = await requireAdmin(args, { role: "owner" });
  const form = await args.request.formData();
  const intent = form.get("intent");
  if (intent === "invite") return invite(args, me, form);
  if (intent === "resendInvite" || intent === "revokeInvite") return changeInvite(args, me, form, intent);
  return actionError("VALIDATION_FAILED", me.locale);
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

/** Load failure (S-027 AC5): the heading stays and Retry reloads; 403 is the Owner-only state. */
export function ErrorBoundary(props: Route.ErrorBoundaryProps) {
  const error = useRouteError();
  const { t } = useI18n();
  const revalidator = useRevalidator();
  if (isRouteErrorResponse(error) && (error.status === 403 || error.status === 404)) return <AdminErrorBoundary error={props.error} />;
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
