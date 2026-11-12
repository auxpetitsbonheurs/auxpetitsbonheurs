// A person's sheet on the Team screen (S-031 change role, S-032 deactivate / reactivate) and
// the two confirm dialogs. Every action posts through a keyed fetcher: the button shows its
// pending state at once, success is a toast (polite live region), a refusal stays next to
// the button (role=alert) and in an error toast. Making someone Admin and deactivating
// confirm first, naming the person and the consequence.
import { RotateCw, UserCheck, UserX } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { useFetcher, useNavigate } from "react-router";
import { Alert } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Modal } from "~/components/ui/modal";
import { RadioCard } from "~/components/ui/radio-card";
import { SubmitButton } from "~/components/ui/submit-button";
import { showToast } from "~/components/ui/toaster";
import { ADMIN_ROLES, type AdminRole } from "~/domain/admin-account";
import { useI18n } from "~/i18n/react";

export interface TeamAdminView {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  active: boolean;
  lastSignIn: string | null;
}

export type Refusal = { ok: false; intent?: string; error: { code: string; message: string; fields?: Record<string, string> } };
type PersonAnswer =
  | { ok: true; intent: "changeRole"; adminId: string; name: string; role: AdminRole; self: boolean }
  | { ok: true; intent: "deactivate"; adminId: string; name: string; self: boolean; signOutPending: boolean }
  | { ok: true; intent: "reactivate"; adminId: string; name: string }
  | Refusal;

/** Runs `onAnswer` once per new answer of a fetcher (an answer object is never handled twice). */
export function useAnswer<Answer>(fetcher: { state: string; data?: Answer }, onAnswer: (answer: Answer) => void) {
  const handled = useRef<unknown>(null);
  const latest = useRef(onAnswer);
  useEffect(() => {
    latest.current = onAnswer;
  });
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data || handled.current === fetcher.data) return;
    handled.current = fetcher.data;
    latest.current(fetcher.data);
  }, [fetcher.state, fetcher.data]);
}

/** A refusal shown next to the control that caused it (announced at once). */
function Refused({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="mt-2 font-semibold text-destructive">
      {message}
    </p>
  ) : null;
}

/** Focus returns to the person's Actions button once a dialog closes (the sheet is already closed). */
const backToRow = (id: string) => () => (document.getElementById(`actions-admin-${id}`) ? `actions-admin-${id}` : "main");

/** The refusal of a fetcher's last answer, once it is idle (shown next to its button). */
function refusalOf(fetcher: { state: string; data?: PersonAnswer }): string | null {
  return fetcher.state === "idle" && fetcher.data && !fetcher.data.ok ? fetcher.data.error.message : null;
}

/**
 * Answers of the sheet's own actions (promote, reactivate) are handled here, in the sheet that
 * stays mounted: the revalidated row changes under the buttons (reactivated → Deactivate shows),
 * which would unmount a handler living in the button.
 */
function useSheetAnswers(personId: string | undefined, onClose: () => void) {
  const { t } = useI18n();
  const role = useFetcher<PersonAnswer>({ key: `team-role-${personId ?? "none"}` });
  const reactivation = useFetcher<PersonAnswer>({ key: `team-reactivate-${personId ?? "none"}` });
  const handle = (answer: PersonAnswer) => {
    if (!answer.ok) return showToast(answer.error.message, "error");
    onClose();
    if (answer.intent === "changeRole") showToast(t("admin.team.roleChanged", { name: answer.name, role: t(`admin.shell.role.${answer.role}`) }));
    if (answer.intent === "reactivate") showToast(t("admin.team.reactivated", { name: answer.name }));
  };
  useAnswer(role, handle);
  useAnswer(reactivation, handle);
}

/** The role radios; promoting saves at once, making an Owner an Admin asks first (S-031 AC8). */
function RoleForm({ person, onDemote }: { person: TeamAdminView; onDemote: () => void }) {
  const { t } = useI18n();
  const fetcher = useFetcher<PersonAnswer>({ key: `team-role-${person.id}` });
  const [unchanged, setUnchanged] = useState<string | null>(null);
  const refused = unchanged ?? refusalOf(fetcher);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    const chosen = new FormData(event.currentTarget).get("role");
    setUnchanged(null);
    if (chosen === person.role) {
      event.preventDefault();
      setUnchanged(t("admin.team.roleUnchanged", { name: person.name, role: t(`admin.shell.role.${person.role}`) }));
    } else if (chosen === "admin") {
      event.preventDefault();
      onDemote();
    }
  };
  return (
    <fetcher.Form method="post" onSubmit={submit} className="grid gap-3">
      <input type="hidden" name="intent" value="changeRole" />
      <input type="hidden" name="adminId" value={person.id} />
      <fieldset className="min-w-0">
        <legend className="font-semibold">{t("admin.team.roleOf", { name: person.name })}</legend>
        <div className="mt-2 grid gap-2">
          {ADMIN_ROLES.map((role) => (
            <RadioCard
              key={role}
              id={`role-${person.id}-${role}`}
              name="role"
              value={role}
              title={t(`admin.shell.role.${role}`)}
              hint={t(`admin.team.form.${role}Hint`)}
              defaultChecked={role === person.role}
            />
          ))}
        </div>
      </fieldset>
      <SubmitButton pending={fetcher.state !== "idle"} pendingText={t("admin.team.savingRole")} variant="outline" className="h-auto w-full whitespace-normal">
        <span className="wrap-anywhere">{t("admin.team.changeRole", { name: person.name })}</span>
      </SubmitButton>
      <Refused message={fetcher.state === "idle" ? refused : null} />
    </fetcher.Form>
  );
}

/** Reactivate (S-032 AC6): no confirm needed, nothing is lost; the sheet closes on success. */
function ReactivateButton({ person }: { person: TeamAdminView }) {
  const { t } = useI18n();
  const fetcher = useFetcher<PersonAnswer>({ key: `team-reactivate-${person.id}` });
  const refused = refusalOf(fetcher);
  return (
    <fetcher.Form method="post">
      <input type="hidden" name="intent" value="reactivate" />
      <input type="hidden" name="adminId" value={person.id} />
      <SubmitButton pending={fetcher.state !== "idle"} pendingText={t("admin.team.reactivating")} variant="outline" className="h-auto w-full whitespace-normal">
        <UserCheck aria-hidden="true" />
        <span className="wrap-anywhere">{t("admin.team.reactivate", { name: person.name })}</span>
      </SubmitButton>
      <p className="mt-1 text-sm">{t("admin.team.reactivateHint")}</p>
      <Refused message={fetcher.state === "idle" ? refused : null} />
    </fetcher.Form>
  );
}

export interface AdminSheetProps {
  person: TeamAdminView | null;
  onClose: () => void;
  onDemote: (person: TeamAdminView) => void;
  onDeactivate: (person: TeamAdminView) => void;
}

/** The person's sheet: email, role and status as text, Change role, then Deactivate or Reactivate. */
export function AdminSheet({ person, onClose, onDemote, onDeactivate }: AdminSheetProps) {
  const { t } = useI18n();
  useSheetAnswers(person?.id, onClose);
  return (
    <Modal open={person !== null} onClose={onClose} title={person?.name ?? ""} closeLabel={t("admin.states.close")}>
      {person && (
        <>
          <p className="wrap-anywhere">{person.email}</p>
          <p className="text-sm">
            {t(`admin.shell.role.${person.role}`)} · {t(person.active ? "admin.team.status.active" : "admin.team.status.deactivated")}
          </p>
          <div className="mt-4">
            <RoleForm key={person.id} person={person} onDemote={() => onDemote(person)} />
          </div>
          <section aria-labelledby={`access-${person.id}`} className="mt-6">
            <h3 id={`access-${person.id}`} className="font-semibold">
              {t("admin.team.accessTitle")}
            </h3>
            <div className="mt-2">
              {person.active ? (
                <>
                  <Button type="button" variant="outline" className="h-auto w-full border-destructive whitespace-normal text-destructive" onClick={() => onDeactivate(person)}>
                    <UserX aria-hidden="true" />
                    <span className="wrap-anywhere">{t("admin.team.deactivate", { name: person.name })}</span>
                  </Button>
                  <p className="mt-1 text-sm">{t("admin.team.deactivateHint")}</p>
                </>
              ) : (
                <ReactivateButton person={person} />
              )}
            </div>
          </section>
        </>
      )}
    </Modal>
  );
}

function DialogButtons({ cancel, onCancel, children }: { cancel: string; onCancel: () => void; children: ReactNode }) {
  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-2">
      <Button type="button" variant="outline" className="h-auto whitespace-normal" onClick={onCancel}>
        {cancel}
      </Button>
      {children}
    </div>
  );
}

/**
 * "Make {name} an Admin?" (S-031 AC8): names the person and what they lose. After an Owner's
 * own demotion the Team screen is no longer theirs: they land on Today.
 */
export function DemoteDialog({ person, isMe, onClose }: { person: TeamAdminView | null; isMe: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const fetcher = useFetcher<PersonAnswer>({ key: `team-role-${person?.id ?? "none"}` });
  const [refused, setRefused] = useState<string | null>(null);
  const close = () => {
    setRefused(null);
    onClose();
  };
  useAnswer(fetcher, (answer) => {
    if (!answer.ok) {
      setRefused(answer.error.message);
      return showToast(answer.error.message, "error");
    }
    if (answer.intent !== "changeRole") return;
    close();
    const role = t(`admin.shell.role.${answer.role}`);
    showToast(answer.self ? t("admin.team.roleChangedSelf", { role }) : t("admin.team.roleChanged", { name: answer.name, role }));
    if (answer.self) void navigate("/admin");
  });
  const returnFocusTo = useRef(backToRow(""));
  useEffect(() => {
    if (person) returnFocusTo.current = backToRow(person.id);
  }, [person]);
  return (
    <Modal open={person !== null} onClose={close} title={person ? t("admin.team.demoteTitle", { name: person.name }) : ""} closeLabel={t("admin.states.close")} variant="dialog" returnFocusTo={() => returnFocusTo.current()}>
      {person && (
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="changeRole" />
          <input type="hidden" name="adminId" value={person.id} />
          <input type="hidden" name="role" value="admin" />
          <p className="wrap-anywhere">{isMe ? t("admin.team.demoteSelfBody") : t("admin.team.demoteBody", { name: person.name })}</p>
          <Refused message={fetcher.state === "idle" ? refused : null} />
          <DialogButtons cancel={t("admin.team.cancel")} onCancel={close}>
            <SubmitButton pending={fetcher.state !== "idle"} pendingText={t("admin.team.savingRole")} className="h-auto whitespace-normal">
              {t("admin.team.demoteConfirm")}
            </SubmitButton>
          </DialogButtons>
        </fetcher.Form>
      )}
    </Modal>
  );
}

/**
 * "Deactivate {name}?" (S-032 AC8, AC10). When signing their devices out did not finish,
 * the dialog stays open to say so (access is already blocked) and offers Retry, which simply
 * repeats the action.
 */
export function DeactivateDialog({ person, isMe, onClose }: { person: TeamAdminView | null; isMe: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const fetcher = useFetcher<PersonAnswer>({ key: `team-deactivate-${person?.id ?? "none"}` });
  const [refused, setRefused] = useState<string | null>(null);
  const [pendingSignOut, setPendingSignOut] = useState(false);
  const close = () => {
    setRefused(null);
    setPendingSignOut(false);
    onClose();
  };
  useAnswer(fetcher, (answer) => {
    if (!answer.ok) {
      setRefused(answer.error.message);
      return showToast(answer.error.message, "error");
    }
    if (answer.intent !== "deactivate") return;
    if (answer.signOutPending) {
      setPendingSignOut(true);
      return showToast(t("admin.team.signOutPending"), "error");
    }
    close();
    showToast(t("admin.team.deactivated", { name: answer.name }));
  });
  const returnFocusTo = useRef(backToRow(""));
  useEffect(() => {
    if (person) returnFocusTo.current = backToRow(person.id);
  }, [person]);
  const pending = fetcher.state !== "idle";
  return (
    <Modal open={person !== null} onClose={close} title={person ? t("admin.team.deactivateTitle", { name: person.name }) : ""} closeLabel={t("admin.states.close")} variant="dialog" returnFocusTo={() => returnFocusTo.current()}>
      {person && (
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="deactivate" />
          <input type="hidden" name="adminId" value={person.id} />
          {pendingSignOut ? (
            <Alert tone="warning" title={t("admin.team.signOutPending")}>
              <p>{t("admin.team.signOutPendingBody", { name: person.name })}</p>
            </Alert>
          ) : (
            <p className="wrap-anywhere">{isMe ? t("admin.team.deactivateSelfBody") : t("admin.team.deactivateBody", { name: person.name })}</p>
          )}
          <Refused message={pending ? null : refused} />
          <DialogButtons cancel={pendingSignOut ? t("admin.states.close") : t("admin.team.cancel")} onCancel={close}>
            {pendingSignOut ? (
              <SubmitButton pending={pending} pendingText={t("admin.team.retrying")} variant="outline" className="h-auto whitespace-normal">
                <RotateCw aria-hidden="true" />
                {t("admin.states.retry")}
              </SubmitButton>
            ) : (
              <SubmitButton pending={pending} pendingText={t("admin.team.deactivating")} variant="destructive" className="h-auto whitespace-normal">
                {t("admin.team.deactivateConfirm")}
              </SubmitButton>
            )}
          </DialogButtons>
        </fetcher.Form>
      )}
    </Modal>
  );
}
