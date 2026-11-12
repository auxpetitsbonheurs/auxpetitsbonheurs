// Team screen (S-027 list, S-028 invite sheet, S-030 resend / revoke; a person's sheet with
// change role and deactivate / reactivate is in team-person.tsx, S-031, S-032). Every action posts
// through a keyed fetcher: the button shows its pending state at once, the result is a
// toast (polite live region) and an error also stays in the sheet next to the fields.
import { Ellipsis, Mail, Plus, RotateCw, Trash2 } from "lucide-react";
import { type RefObject, useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { ErrorSummary } from "~/components/checkout/error-summary";
import { Button } from "~/components/ui/button";
import { Modal } from "~/components/ui/modal";
import { RadioCard } from "~/components/ui/radio-card";
import { SubmitButton } from "~/components/ui/submit-button";
import { TextField } from "~/components/ui/text-field";
import { showToast } from "~/components/ui/toaster";
import { ADMIN_ROLES, type AdminRole, PROFILE_NAME_MAX } from "~/domain/admin-account";
import { useI18n } from "~/i18n/react";
import { AdminSheet, DeactivateDialog, DemoteDialog, type Refusal, type TeamAdminView, useAnswer } from "./team-person";

export type { TeamAdminView } from "./team-person";

export interface TeamInviteView {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  validUntil: string;
  emailNotSent: boolean;
}

export interface TeamData {
  meId: string;
  admins: TeamAdminView[];
  invites: TeamInviteView[];
}

type TeamAnswer = { ok: true; intent: "invite" | "resendInvite" | "revokeInvite"; email: string; emailQueued?: boolean } | Refusal;

const tagClass = "rounded-sm border border-input px-1.5 font-semibold";

function RowActions({ id, label, onOpen }: { id: string; label: string; onOpen: () => void }) {
  return (
    <Button id={id} type="button" variant="ghost" size="icon" aria-label={label} onClick={onOpen}>
      <Ellipsis aria-hidden="true" />
    </Button>
  );
}

function AdminRow({ person, isMe, onOpen }: { person: TeamAdminView; isMe: boolean; onOpen: () => void }) {
  const { t } = useI18n();
  return (
    <li className="flex min-h-20 flex-wrap items-center gap-3 p-3">
      <div className="min-w-0 flex-[1_1_10rem]">
        <p className="font-semibold wrap-anywhere">
          {person.name}
          {isMe && <span className="font-normal"> ({t("admin.team.you")})</span>}
        </p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span>{t(`admin.shell.role.${person.role}`)}</span>
          <span className={tagClass}>{t(person.active ? "admin.team.status.active" : "admin.team.status.deactivated")}</span>
        </p>
        <p className="text-sm text-muted-foreground">{person.lastSignIn ? t("admin.team.lastSignIn", { time: person.lastSignIn }) : t("admin.team.neverSignedIn")}</p>
      </div>
      <RowActions id={`actions-admin-${person.id}`} label={t("admin.team.actionsFor", { name: person.name })} onOpen={onOpen} />
    </li>
  );
}

function InviteRow({ invite, onOpen }: { invite: TeamInviteView; onOpen: () => void }) {
  const { t } = useI18n();
  return (
    <li className="flex min-h-20 flex-wrap items-center gap-3 p-3">
      <div className="min-w-0 flex-[1_1_10rem]">
        <p className="font-semibold wrap-anywhere">{invite.name}</p>
        <p className="text-sm wrap-anywhere">{invite.email}</p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span>{t(`admin.shell.role.${invite.role}`)}</span>
          <span>{t("admin.team.validUntil", { date: invite.validUntil })}</span>
        </p>
        {invite.emailNotSent && <p className="mt-1 text-sm font-semibold text-destructive">{t("admin.team.emailNotSent")}</p>}
      </div>
      <RowActions id={`actions-invite-${invite.id}`} label={t("admin.team.actionsFor", { name: invite.name })} onOpen={onOpen} />
    </li>
  );
}

function FieldError({ id, text }: { id: string; text?: string }) {
  return text ? (
    <p id={id} className="mt-1 font-semibold text-destructive">
      {text}
    </p>
  ) : null;
}

function InviteFields({ fields }: { fields?: Record<string, string> }) {
  const { t, locale } = useI18n();
  return (
    <>
      <TextField id="invite-name" name="name" label={t("admin.team.form.name")} autoComplete="off" maxLength={PROFILE_NAME_MAX} error={fields?.name} />
      <TextField id="invite-email" name="email" type="email" inputMode="email" label={t("admin.team.form.email")} autoComplete="off" spellCheck={false} error={fields?.email} />
      <fieldset className="min-w-0" aria-describedby={fields?.role ? "invite-role-error" : undefined}>
        <legend className="font-semibold">{t("admin.team.form.role")}</legend>
        <div className="mt-2 grid gap-2">
          {ADMIN_ROLES.map((role) => (
            <RadioCard key={role} id={`invite-role-${role}`} name="role" value={role} title={t(`admin.shell.role.${role}`)} hint={t(`admin.team.form.${role}Hint`)} defaultChecked={role === "admin"} />
          ))}
        </div>
        <FieldError id="invite-role-error" text={fields?.role} />
      </fieldset>
      <fieldset className="min-w-0" aria-describedby={fields?.locale ? "invite-locale-error" : undefined}>
        <legend className="font-semibold">{t("admin.team.form.language")}</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <RadioCard id="invite-locale-en" name="locale" value="en" title={t("admin.profile.english")} defaultChecked={locale === "en"} />
          <RadioCard id="invite-locale-fr" name="locale" value="fr" title={t("admin.profile.french")} defaultChecked={locale === "fr"} />
        </div>
        <FieldError id="invite-locale-error" text={fields?.locale} />
      </fieldset>
    </>
  );
}

const INVITE_ANCHORS = { name: "invite-name", email: "invite-email", role: "invite-role-admin", locale: "invite-locale-en" };

/** The invite sheet (S-028 AC8): named dialog, errors summarised and focused, focus back to the trigger on close. */
function InviteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const fetcher = useFetcher<TeamAnswer>({ key: "team-invite" });
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const summary = useRef<HTMLDivElement>(null);
  // A closed sheet forgets its last refusal: the next invite starts clean.
  const close = () => {
    setRefusal(null);
    onClose();
  };
  useAnswer(fetcher, (answer) => {
    if (!answer.ok) return setRefusal(answer);
    close();
    if (answer.emailQueued) showToast(t("admin.team.sent", { email: answer.email }));
    else showToast(t("admin.team.savedNotSent", { email: answer.email }), "error");
  });
  useEffect(() => {
    if (refusal) summary.current?.focus();
  }, [refusal]);
  return (
    <Modal open={open} onClose={close} title={t("admin.team.form.title")} closeLabel={t("admin.states.close")}>
      <p>{t("admin.team.form.intro")}</p>
      {refusal && <InviteRefusal refusal={refusal} summaryRef={summary} />}
      <fetcher.Form method="post" noValidate className="mt-4 grid gap-5">
        <input type="hidden" name="intent" value="invite" />
        <InviteFields fields={refusal?.error.fields} />
        <SubmitButton pending={fetcher.state !== "idle"} pendingText={t("admin.team.form.sending")} pendingLabel={t("admin.team.form.sending")} size="lg" className="w-full">
          <Mail aria-hidden="true" />
          {t("admin.team.form.send")}
        </SubmitButton>
      </fetcher.Form>
    </Modal>
  );
}

function InviteRefusal({ refusal, summaryRef }: { refusal: Refusal; summaryRef: RefObject<HTMLDivElement | null> }) {
  const { t } = useI18n();
  return (
    <ErrorSummary ref={summaryRef} message={refusal.error.message} fields={refusal.error.fields} anchors={INVITE_ANCHORS} title={t("admin.team.form.errorSummaryTitle")} />
  );
}

/** Resend from the invitation's sheet (S-030 AC1); the sheet closes on success (the row is replaced). */
function ResendButton({ invite, onDone }: { invite: TeamInviteView; onDone: () => void }) {
  const { t } = useI18n();
  const fetcher = useFetcher<TeamAnswer>({ key: `team-resend-${invite.id}` });
  const [failed, setFailed] = useState<string | null>(null);
  useAnswer(fetcher, (answer) => {
    if (!answer.ok) {
      setFailed(answer.error.message);
      return showToast(answer.error.message, "error");
    }
    onDone();
    showToast(t(answer.emailQueued ? "admin.team.resent" : "admin.team.savedNotSent", { email: answer.email }), answer.emailQueued ? "success" : "error");
  });
  return (
    <fetcher.Form method="post">
      <input type="hidden" name="intent" value="resendInvite" />
      <input type="hidden" name="id" value={invite.id} />
      <SubmitButton pending={fetcher.state !== "idle"} pendingText={t("admin.team.resending")} variant="outline" className="h-auto w-full whitespace-normal">
        <RotateCw aria-hidden="true" />
        <span className="wrap-anywhere">{t("admin.team.resend", { email: invite.email })}</span>
      </SubmitButton>
      {failed && fetcher.state === "idle" && <p className="mt-1 font-semibold text-destructive">{failed}</p>}
    </fetcher.Form>
  );
}

function InviteSheetActions({ invite, onClose, onRevoke }: { invite: TeamInviteView | null; onClose: () => void; onRevoke: (invite: TeamInviteView) => void }) {
  const { t } = useI18n();
  return (
    // Focus goes back to the row's Actions button; after a resend that row is gone and the page takes it.
    <Modal open={invite !== null} onClose={onClose} title={invite?.name ?? ""} closeLabel={t("admin.states.close")}>
      {invite && (
        <>
          <p className="wrap-anywhere">{invite.email}</p>
          <p className="text-sm">
            {t(`admin.shell.role.${invite.role}`)} · {t("admin.team.validUntil", { date: invite.validUntil })}
          </p>
          <ul className="mt-4 grid gap-2">
            <li>
              <ResendButton invite={invite} onDone={onClose} />
            </li>
            <li className="mt-4">
              <Button type="button" variant="outline" className="h-auto w-full border-destructive whitespace-normal text-destructive" onClick={() => onRevoke(invite)}>
                <Trash2 aria-hidden="true" />
                <span className="wrap-anywhere">{t("admin.team.revoke", { email: invite.email })}</span>
              </Button>
            </li>
          </ul>
        </>
      )}
    </Modal>
  );
}

/** Revoke confirmation (S-030 AC2, AC6): only its own button revokes; focus returns to the row, or the page once it left. */
function RevokeDialog({ invite, onClose }: { invite: TeamInviteView | null; onClose: () => void }) {
  const { t } = useI18n();
  const fetcher = useFetcher<TeamAnswer>({ key: `team-revoke-${invite?.id ?? "none"}` });
  const [failed, setFailed] = useState<string | null>(null);
  const close = () => {
    setFailed(null);
    onClose();
  };
  useAnswer(fetcher, (answer) => {
    if (!answer.ok) {
      setFailed(answer.error.message);
      return showToast(answer.error.message, "error");
    }
    close();
    showToast(t("admin.team.revoked", { email: answer.email }));
  });
  // The dialog opens from the sheet (already closed): focus returns to the row's Actions button, or the page once the row left.
  const actionsId = useRef("");
  useEffect(() => {
    if (invite) actionsId.current = `actions-invite-${invite.id}`;
  }, [invite]);
  return (
    <Modal
      open={invite !== null}
      onClose={close}
      title={t("admin.team.revokeTitle")}
      closeLabel={t("admin.states.close")}
      variant="dialog"
      returnFocusTo={() => (document.getElementById(actionsId.current) ? actionsId.current : "main")}
    >
      {invite && (
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="revokeInvite" />
          <input type="hidden" name="id" value={invite.id} />
          <p className="wrap-anywhere">{t("admin.team.revokeBody", { email: invite.email })}</p>
          {failed && fetcher.state === "idle" && (
            <p role="alert" className="mt-2 font-semibold text-destructive">
              {failed}
            </p>
          )}
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" onClick={close}>
              {t("admin.team.keep")}
            </Button>
            <SubmitButton pending={fetcher.state !== "idle"} pendingText={t("admin.team.revoking")} variant="destructive">
              {t("admin.team.revokeConfirm")}
            </SubmitButton>
          </div>
        </fetcher.Form>
      )}
    </Modal>
  );
}

/**
 * An invitation's sheet keeps the row it opened with: a Resend replaces the row (new id) in
 * the revalidated list before its answer arrives, and the sheet must stay to report it.
 */
type Selection = { kind: "admin"; id: string } | { kind: "invite"; invite: TeamInviteView } | null;

export function TeamScreen({ team }: { team: TeamData }) {
  const { t } = useI18n();
  const [inviting, setInviting] = useState(false);
  const [selected, setSelected] = useState<Selection>(null);
  const [revoking, setRevoking] = useState<TeamInviteView | null>(null);
  // Confirm dialogs keep the row they opened with: the list revalidates under them.
  const [demoting, setDemoting] = useState<TeamAdminView | null>(null);
  const [deactivating, setDeactivating] = useState<TeamAdminView | null>(null);
  const openAdmin = selected?.kind === "admin" ? (team.admins.find((a) => a.id === selected.id) ?? null) : null;
  const openInvite = selected?.kind === "invite" ? selected.invite : null;
  const alone = team.admins.length === 1;
  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>{t("admin.team.title")}</h1>
        {/* Wraps at 200% zoom on a 320 px phone instead of pushing the page sideways. */}
        <Button type="button" className="h-auto min-w-0 shrink whitespace-normal max-[20rem]:px-3" onClick={() => setInviting(true)}>
          <Plus aria-hidden="true" />
          {t("admin.team.invite")}
        </Button>
      </div>
      <section aria-labelledby="team-admins" className="mt-6">
        <h2 id="team-admins">{t("admin.team.adminsTitle")}</h2>
        <ul className="mt-3 divide-y divide-border overflow-hidden rounded-card border border-border bg-card">
          {team.admins.map((person) => (
            <AdminRow key={person.id} person={person} isMe={person.id === team.meId} onOpen={() => setSelected({ kind: "admin", id: person.id })} />
          ))}
        </ul>
        {alone && <p className="mt-3 font-semibold">{t("admin.team.onlyYou")}</p>}
      </section>
      {team.invites.length > 0 && (
        <section aria-labelledby="team-invites" className="mt-8">
          <h2 id="team-invites">{t("admin.team.invitesTitle")}</h2>
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-card border border-border bg-card">
            {team.invites.map((invite) => (
              <InviteRow key={invite.id} invite={invite} onOpen={() => setSelected({ kind: "invite", invite })} />
            ))}
          </ul>
        </section>
      )}
      <InviteSheet open={inviting} onClose={() => setInviting(false)} />
      <AdminSheet
        person={openAdmin}
        onClose={() => setSelected(null)}
        onDemote={(person) => {
          setSelected(null);
          setDemoting(person);
        }}
        onDeactivate={(person) => {
          setSelected(null);
          setDeactivating(person);
        }}
      />
      <DemoteDialog person={demoting} isMe={demoting?.id === team.meId} onClose={() => setDemoting(null)} />
      <DeactivateDialog person={deactivating} isMe={deactivating?.id === team.meId} onClose={() => setDeactivating(null)} />
      <InviteSheetActions
        invite={openInvite}
        onClose={() => setSelected(null)}
        onRevoke={(invite) => {
          setSelected(null);
          setRevoking(invite);
        }}
      />
      <RevokeDialog invite={revoking} onClose={() => setRevoking(null)} />
    </div>
  );
}
