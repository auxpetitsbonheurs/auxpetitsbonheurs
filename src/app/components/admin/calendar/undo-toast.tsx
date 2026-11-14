import { CircleAlert, CircleCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

export const UNDO_MS = 6000;

export interface UndoMessage {
  id: number;
  text: string;
  tone: "success" | "error";
  /** Present while Undo is offered. */
  undo?: { label: string; name: string; run: () => void };
}

/**
 * "Day blocked" with Undo for 6 s (S-138 AC1, AC4, AC12): a polite `role=status` region always in
 * the page; the timer pauses while the toast is focused or hovered, so Undo stays reachable by
 * keyboard. The same action also exists on the page itself (Reopen / Block).
 */
export function CalendarUndoToast({ message, onDone }: { message: UndoMessage | null; onDone: (id: number) => void }) {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!message || held) return;
    const timer = setTimeout(() => onDone(message.id), message.undo ? UNDO_MS : 4000);
    return () => clearTimeout(timer);
  }, [message, held, onDone]);
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 md:bottom-6 print:hidden"
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
    >
      {message && (
        <div data-testid="calendar-toast" className={cn("pointer-events-auto flex w-full max-w-md flex-wrap items-center gap-3 rounded-card border-2 bg-card p-3 shadow-lg", message.tone === "success" ? "border-success" : "border-destructive")}>
          {message.tone === "success" ? <CircleCheck aria-hidden="true" className="size-5 shrink-0 text-success" /> : <CircleAlert aria-hidden="true" className="size-5 shrink-0 text-destructive" />}
          <p className="min-w-0 flex-1 font-semibold wrap-anywhere">{message.text}</p>
          {message.undo && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={message.undo.name}
              onClick={() => {
                message.undo?.run();
                onDone(message.id);
              }}
            >
              {message.undo.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
