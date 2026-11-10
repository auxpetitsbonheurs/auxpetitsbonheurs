import { Check, Copy, Share2 } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { Button, buttonVariants } from "~/components/ui/button";
import { useI18n } from "~/i18n/react";

/** True once React runs in the browser: copy buttons need JavaScript, so they appear only then. */
export function useHydrated(): boolean {
  return useSyncExternalStore(noSubscription, () => true, () => false);
}

const noSubscription = () => () => {};

/** Copies text and reports the outcome as one polite status message (design-system "Toast" rule: role=status). */
export function useCopyStatus() {
  const { t } = useI18n();
  const [status, setStatus] = useState("");
  const copy = async (text: string, done: string) => {
    // Clear first so the same message is announced again on a second press.
    setStatus("");
    try {
      await navigator.clipboard.writeText(text);
      setStatus(done);
    } catch {
      setStatus(t("order.confirmed.copyFailed"));
    }
  };
  return { status, copy };
}

export function CopyButton({ label, copied, onCopy }: { label: string; copied: boolean; onCopy: () => void }) {
  return (
    <Button type="button" variant="outline" onClick={onCopy} className="max-w-full">
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      {label}
    </Button>
  );
}

/**
 * Share: a WhatsApp link that works without JavaScript; with JavaScript the system share
 * sheet is used where the browser has one. Opens in a new tab with no referrer.
 */
export function ShareLink({ label, text }: { label: string; text: string }) {
  const href = `https://wa.me/?text=${encodeURIComponent(text)}`;
  const onClick = (event: React.MouseEvent) => {
    if (typeof navigator.share !== "function") return;
    event.preventDefault();
    navigator.share({ text }).catch(() => {});
  };
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} className={buttonVariants({ variant: "outline", className: "max-w-full" })}>
      <Share2 aria-hidden="true" />
      {label}
    </a>
  );
}

/** The live region every copy action reports to; visible so sighted users see it too. */
export function CopyStatus({ status }: { status: string }) {
  return (
    <p role="status" aria-live="polite" className="mt-3 min-h-6 font-semibold">
      {status}
    </p>
  );
}
