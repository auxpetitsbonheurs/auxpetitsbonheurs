import { X } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef } from "react";
import { cn } from "~/lib/utils";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keeps Tab inside the dialog: a modal `<dialog>` makes the page inert, but Tab past its
 * last control would move to the browser's own UI. Wraps last → first and first → last.
 */
function trapTab(event: KeyboardEvent<HTMLDialogElement>, dialog: HTMLDialogElement | null) {
  if (event.key !== "Tab" || !dialog) return;
  const controls = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
  if (controls.length === 0) return;
  const first = controls[0]!;
  const last = controls.at(-1)!;
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !dialog.contains(active) || active === dialog.querySelector("h2"))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Visible label of the 44 px close button ("Close" / "Fermer"). */
  closeLabel: string;
  /** `sheet`: bottom sheet on phones (centred panel from md); `dialog`: confirm dialog. */
  variant?: "sheet" | "dialog";
  /**
   * Where focus goes once it has closed, when not back to the trigger: an element id, read
   * at close time (e.g. "main" after the trigger's row was deleted).
   */
  returnFocusTo?: () => string | null;
  children: ReactNode;
  className?: string;
  /** `alertdialog` for a confirm that interrupts (S-138 AC12); focus still starts on the title (no button pre-chosen). */
  role?: "alertdialog";
}

/**
 * Bottom sheet and confirm dialog (design-system "Feedback") on the native modal
 * `<dialog>`: the browser closes it on Esc and makes the page behind inert, at no bundle
 * cost; Tab wraps inside it (`trapTab`). Focus moves to the title on open and back to the trigger on close; the
 * admin bottom bar hides while it is open (`html[data-sheet-open]`). Tapping the backdrop
 * closes it.
 */
export function Modal({ open, onClose, title, closeLabel, variant = "sheet", returnFocusTo, children, className, role }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const returnTo = useRef(returnFocusTo);
  useEffect(() => {
    returnTo.current = returnFocusTo;
  });

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
      const elsewhere = returnTo.current?.();
      // The trigger may be gone (its row was just deleted): the page's main region takes focus.
      if (elsewhere) document.getElementById(elsewhere)?.focus();
      else if (target?.isConnected) target.focus();
      else document.getElementById("main")?.focus();
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
      role={role}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      onKeyDown={(event) => trapTab(event, ref.current)}
      className={cn(
        // 90dvh: design-system "Bottom sheets … max 90% height"; no size token for it.
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
