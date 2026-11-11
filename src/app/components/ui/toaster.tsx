import { CircleAlert, CircleCheck, X } from "lucide-react";
import { useSyncExternalStore } from "react";
import { useI18n } from "~/i18n/react";
import { cn } from "~/lib/utils";

export type ToastTone = "success" | "error";

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

/** Success toasts leave after 4 s; errors stay until dismissed (design-system "Toast"). */
export const TOAST_SUCCESS_MS = 4000;

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export function dismissToast(id: number): void {
  items = items.filter((item) => item.id !== id);
  emit();
}

/** Shows a toast in the page's Toaster. Never the only place an error is shown. */
export function showToast(message: string, tone: ToastTone = "success"): void {
  const id = nextId++;
  // One at a time: a newer confirmation replaces an older one of the same tone.
  items = [...items.filter((item) => item.tone !== tone), { id, tone, message }];
  emit();
  if (tone === "success") setTimeout(() => dismissToast(id), TOAST_SUCCESS_MS);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const snapshot = () => items;
const serverSnapshot = (): ToastItem[] => [];

/**
 * Toast region: bottom of the screen on phones, above the admin bottom bar and any sticky
 * bar. The region is always in the page (`role=status`, polite) so new text is announced.
 */
export function Toaster() {
  const { t } = useI18n();
  const toasts = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return (
    <div
      role="status"
      aria-live="polite"
      // 9.5rem clears the bottom bar (56 px + safe area) and a sticky action bar; no spacing token is that tall.
      className="pointer-events-none fixed inset-x-0 bottom-[calc(9.5rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4 md:bottom-6"
    >
      {toasts.map((toast) => {
        const Icon = toast.tone === "success" ? CircleCheck : CircleAlert;
        return (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-card border-2 bg-card p-3 shadow-lg",
              toast.tone === "success" ? "border-success" : "border-destructive",
            )}
          >
            <Icon aria-hidden="true" className={cn("size-5 shrink-0", toast.tone === "success" ? "text-success" : "text-destructive")} />
            <p className="min-w-0 flex-1 font-semibold wrap-anywhere">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-muted"
              aria-label={t("admin.states.dismiss")}
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
