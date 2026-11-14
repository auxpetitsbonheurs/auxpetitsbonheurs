import { CircleAlert, CircleCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { Button } from "~/components/ui/button";
import { useI18n } from "~/i18n/react";
import { cn } from "~/lib/utils";
import { type UndoOffer, clearUndo, useUndoOffer } from "./undo-store";

export const UNDO_MS = 6000;
const RESULT_MS = 4000;

type Answer = { ok: true } | { ok: false; error: { code: string; message: string } };

interface Result {
  text: string;
  tone: "success" | "error";
}

/** The answer to the last Undo, turned into a message once (state from the previous render, no effect). */
function useUndoResult(fetcher: { state: string; data?: Answer }, pending: UndoOffer | null) {
  const { t } = useI18n();
  const [seen, setSeen] = useState<Answer | undefined>(undefined);
  const [result, setResult] = useState<Result | null>(null);
  if (fetcher.state === "idle" && fetcher.data && fetcher.data !== seen && pending) {
    setSeen(fetcher.data);
    setResult(
      fetcher.data.ok
        ? { text: t("admin.today.undone", { number: pending.number, status: pending.previousLabel }), tone: "success" }
        : { text: t("admin.today.undoFailed"), tone: "error" },
    );
  }
  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => setResult(null), RESULT_MS);
    return () => clearTimeout(timer);
  }, [result]);
  return result;
}

/**
 * "APB-0042 marked In preparation." with Undo for 6 s (S-121 AC2, AC7): a polite `role=status`
 * region always in the page; the timer stops while the toast is focused or hovered, so Undo stays
 * reachable by keyboard. Undo sends `revert` with the version after the forward step (no email);
 * if anything changed since, it says "Could not undo, the order changed."
 */
export function UndoToast() {
  const { t } = useI18n();
  const offer = useUndoOffer();
  const fetcher = useFetcher<Answer>({ key: "today-undo" });
  const [held, setHeld] = useState(false);
  const [pending, setPending] = useState<UndoOffer | null>(null);
  const result = useUndoResult(fetcher, pending);

  useEffect(() => {
    if (!offer || held) return;
    const timer = setTimeout(() => clearUndo(offer.id), UNDO_MS);
    return () => clearTimeout(timer);
  }, [offer, held]);

  const undo = () => {
    if (!offer || fetcher.state !== "idle") return;
    setPending(offer);
    clearUndo(offer.id);
    setHeld(false);
    fetcher.submit({ intent: "revert", orderId: offer.orderId, version: String(offer.version) }, { method: "post" });
  };

  const shown = offer ? { text: t("admin.today.marked", { number: offer.number, status: offer.statusLabel }), tone: "success" as const } : result;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 md:bottom-6"
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
    >
      {shown && (
        <div data-testid="today-toast" className={cn("pointer-events-auto flex w-full max-w-md flex-wrap items-center gap-3 rounded-card border-2 bg-card p-3 shadow-lg", shown.tone === "success" ? "border-success" : "border-destructive")}>
          {shown.tone === "success" ? <CircleCheck aria-hidden="true" className="size-5 shrink-0 text-success" /> : <CircleAlert aria-hidden="true" className="size-5 shrink-0 text-destructive" />}
          <p className="min-w-0 flex-1 font-semibold wrap-anywhere">{shown.text}</p>
          {offer && (
            <Button type="button" variant="outline" size="sm" onClick={undo} aria-label={t("admin.today.undoNamed", { number: offer.number, status: offer.previousLabel })}>
              {t("admin.today.undo")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
