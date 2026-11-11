import { X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { cn } from "~/lib/utils";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Visible label of the 44 px close button ("Close" / "Fermer"). */
  closeLabel: string;
  /** `sheet`: bottom sheet on phones (centred panel from md); `dialog`: confirm dialog. */
  variant?: "sheet" | "dialog";
  children: ReactNode;
  className?: string;
}

/**
 * Bottom sheet and confirm dialog (design-system "Feedback") on the native modal
 * `<dialog>`: the browser traps focus, closes on Esc and makes the page behind inert, at
 * no bundle cost. Focus moves to the title on open and back to the trigger on close; the
 * admin bottom bar hides while it is open (`html[data-sheet-open]`). Tapping the backdrop
 * closes it.
 */
export function Modal({ open, onClose, title, closeLabel, variant = "sheet", children, className }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      document.documentElement.setAttribute("data-sheet-open", "");
      titleRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Whatever closed it (Esc, the close button, a parent), the frame and focus come back.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const restore = () => {
      document.documentElement.removeAttribute("data-sheet-open");
      const target = trigger.current;
      trigger.current = null;
      if (target?.isConnected) target.focus();
    };
    dialog.addEventListener("close", restore);
    return () => dialog.removeEventListener("close", restore);
  }, []);

  useEffect(() => () => {
    document.documentElement.removeAttribute("data-sheet-open");
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        "max-h-[90dvh] w-full max-w-none overflow-y-auto bg-card text-foreground shadow-lg backdrop:bg-foreground/40",
        variant === "sheet"
          ? "mt-auto mb-0 rounded-t-xl pb-[env(safe-area-inset-bottom)] md:m-auto md:max-w-lg md:rounded-card"
          : "m-auto max-w-[min(32rem,calc(100%-2rem))] rounded-card",
        className,
      )}
    >
      {open && (
        <div className="p-4">
          <div className="flex items-start gap-2">
            <h2 ref={titleRef} id={titleId} tabIndex={-1} className="min-w-0 flex-1 pt-1.5 text-xl outline-none wrap-anywhere">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-muted"
              aria-label={closeLabel}
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>
          <div className="mt-3">{children}</div>
        </div>
      )}
    </dialog>
  );
}
