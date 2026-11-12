// "Add the app to your home screen" (S-035 AC3-AC5, AC7): an inline banner at the top of the
// admin page, never fixed (it cannot cover the bottom bar), inside a polite live region. On
// Android Chrome it keeps the browser's install offer and opens it from "Install"; on iOS
// Safari it shows the Share hint. "Not now" / "Hide this tip" are remembered in this browser.
// Also registers the service worker (/admin/sw.js, scope /admin/) for later push (E-10).
import { Download, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import { useI18n } from "~/i18n/react";
import { INSTALL_DISMISSED_KEY, type InstallOffer, installOffer } from "~/lib/install-hint";

/** Chrome's `beforeinstallprompt` event (not in the DOM typings). */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Kept from the moment this module loads, before hydration: the offer can come early.
let deferred: InstallPromptEvent | null = null;
const offerListeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    for (const listener of offerListeners) listener();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    for (const listener of offerListeners) listener();
  });
}

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(INSTALL_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberDismissed(): void {
  try {
    window.localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
  } catch {
    // Private mode or blocked storage: hidden for this page view only.
  }
}

function currentOffer(dismissed: boolean): InstallOffer {
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  return installOffer({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints, standalone, dismissed, promptAvailable: deferred !== null });
}

function useServiceWorker(): void {
  useEffect(() => {
    navigator.serviceWorker?.register("/admin/sw.js", { scope: "/admin/" }).catch(() => undefined);
  }, []);
}

export function InstallBanner() {
  const { t } = useI18n();
  const [offer, setOffer] = useState<InstallOffer>(null);
  useServiceWorker();
  useEffect(() => {
    const update = () => setOffer(currentOffer(readDismissed()));
    update();
    offerListeners.add(update);
    return () => void offerListeners.delete(update);
  }, []);
  const dismiss = () => {
    rememberDismissed();
    setOffer(null);
  };
  const install = async () => {
    const prompt = deferred;
    deferred = null;
    setOffer(null);
    if (!prompt) return;
    await prompt.prompt();
    // Declined in the native prompt counts as "Not now": it does not come back.
    if ((await prompt.userChoice).outcome === "dismissed") rememberDismissed();
  };
  return (
    <div role="status" aria-live="polite" className="empty:hidden">
      {offer && (
        <section aria-label={t("admin.install.label")} className="mb-4 rounded-card border border-border bg-card p-3" data-install-banner="">
          {offer === "prompt" ? (
            <>
              <p className="font-semibold">{t("admin.install.title")}</p>
              <p className="text-sm">{t("admin.install.body")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" size="sm" className="h-auto min-h-11 whitespace-normal" onClick={() => void install()}>
                  <Download aria-hidden="true" />
                  {t("admin.install.install")}
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-auto min-h-11 whitespace-normal" onClick={dismiss}>
                  {t("admin.install.notNow")}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex items-start gap-2">
              <p className="min-w-0 flex-1 self-center">{t("admin.install.iosHint")}</p>
              <Button type="button" size="icon" variant="ghost" aria-label={t("admin.install.dismiss")} onClick={dismiss}>
                <X aria-hidden="true" />
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
