import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { useI18n } from "~/i18n/react";
import { Section } from "./sections";
import type { OrderActionAnswer } from "./use-order-action";

export const NOTE_MAX = 2000;
export const NOTE_IDLE_MS = 1000;

/** What the admin did last; the shown status is derived from it and the fetcher. */
type NotePhase = "idle" | "typing" | "tooLong" | "sent";

function noteStatus(phase: NotePhase, fetcher: { state: string; data?: OrderActionAnswer }): "saving" | "saved" | "tooLong" | "failed" | null {
  if (phase === "tooLong") return "tooLong";
  if (phase !== "sent") return null;
  if (fetcher.state !== "idle") return "saving";
  if (!fetcher.data) return null;
  if (fetcher.data.ok) return "saved";
  return fetcher.data.error.code === "VALIDATION_FAILED" ? "tooLong" : "failed";
}

/**
 * Private note with autosave (S-114 AC1-AC3, AC7): 1 s after the last keystroke the note is
 * saved (`saveNote`, no version: it never conflicts with status changes) and "Saved" is announced
 * politely. A note over 2000 characters, or a failed save, shows an error and keeps the text.
 * Without JavaScript the Save button posts the same form.
 */
export function PrivateNote({ orderId, initial }: { orderId: string; initial: string }) {
  const { t } = useI18n();
  const fetcher = useFetcher<OrderActionAnswer>({ key: `order-note-${orderId}` });
  const [text, setText] = useState(initial);
  const [phase, setPhase] = useState<NotePhase>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastSent = useRef(initial);

  useEffect(() => () => clearTimeout(timer.current), []);

  const save = (value: string) => {
    if (value.length > NOTE_MAX) return setPhase("tooLong");
    if (value === lastSent.current) return;
    lastSent.current = value;
    setPhase("sent");
    fetcher.submit({ intent: "saveNote", adminNote: value }, { method: "post" });
  };

  const onChange = (value: string) => {
    setText(value);
    clearTimeout(timer.current);
    setPhase(value.length > NOTE_MAX ? "tooLong" : "typing");
    timer.current = setTimeout(() => save(value), NOTE_IDLE_MS);
  };

  const state = noteStatus(phase, fetcher);
  const status = state === "saving" ? t("admin.order.noteSaving") : state === "saved" ? t("admin.order.noteSaved") : "";
  const error = state === "tooLong" ? t("admin.order.noteTooLong", { max: NOTE_MAX }) : state === "failed" ? t("admin.order.noteFailed") : "";
  return (
    <Section id="note-heading" title={t("admin.order.noteTitle")}>
      <fetcher.Form method="post" className="mt-3" onSubmit={(event) => (event.preventDefault(), save(text))}>
        <input type="hidden" name="intent" value="saveNote" />
        <label htmlFor="admin-note" className="sr-only">
          {t("admin.order.noteTitle")}
        </label>
        <p id="admin-note-hint" className="text-sm text-muted-foreground">
          {t("admin.order.noteHint")}
        </p>
        <textarea
          id="admin-note"
          name="adminNote"
          rows={4}
          value={text}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => (clearTimeout(timer.current), save(text))}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "admin-note-hint admin-note-error" : "admin-note-hint"}
          className="mt-2 block min-h-24 w-full rounded-md border-2 border-input bg-card px-3 py-2 text-base text-foreground aria-invalid:border-destructive"
        />
        {error && (
          <p id="admin-note-error" className="mt-1 font-semibold text-destructive wrap-anywhere">
            {error}
          </p>
        )}
        <p role="status" aria-live="polite" data-testid="note-status" className="mt-1 min-h-6 text-sm">
          {status}
        </p>
        <noscript>
          <button type="submit" className="mt-2 inline-flex min-h-11 items-center rounded-md border-2 border-input px-4 font-semibold">
            {t("admin.order.noteSave")}
          </button>
        </noscript>
      </fetcher.Form>
    </Section>
  );
}
