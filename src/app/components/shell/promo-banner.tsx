// Promo banner (S-062, FR-002; design-system "Promo banner"): one calm line at the top of
// every customer page while a banner promotion is live. No motion, no auto-rotate. Dismiss
// works without JavaScript (a form post that sets the session cookie and comes back); with
// JavaScript it hides at once and posts in the background. It also hides itself on the
// promotion's end instant, so a page left open never shows an offer that has ended.
import { X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useLocation } from "react-router";
import { localized } from "~/i18n/localized";
import { useI18n } from "~/i18n/react";
import { localePath } from "~/lib/locale";

export interface PromoBannerData {
  id: string;
  title: { en: string; fr: string | null };
  text: { en: string; fr: string | null } | null;
  href: string | null;
  endsAt: string;
}

/** setTimeout holds at most ~24.8 days; a later end is checked on a later page load. */
const MAX_TIMER_MS = 2 ** 31 - 1;

/** True once `endsAt` has passed in this browser (checked after hydration: the server already judged it). */
function useEnded(endsAt: string | undefined): boolean {
  const [ended, setEnded] = useState(false);
  useEffect(() => {
    if (!endsAt) return;
    const wait = Date.parse(endsAt) - Date.now();
    if (wait > MAX_TIMER_MS) return;
    const timer = setTimeout(() => setEnded(true), Math.max(0, wait));
    return () => clearTimeout(timer);
  }, [endsAt]);
  return ended;
}

export function PromoBanner({ banner }: { banner: PromoBannerData | null }) {
  const { t, locale } = useI18n();
  const location = useLocation();
  const [dismissed, setDismissed] = useState<string | null>(null);
  const ended = useEnded(banner?.endsAt);
  if (!banner || dismissed === banner.id || ended) return null;
  const title = localized(banner.title, locale);
  const text = banner.text ? localized(banner.text, locale) : null;

  const dismiss = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = new FormData(event.currentTarget);
    body.set("respond", "inline");
    setDismissed(banner.id);
    // Focus would be lost with the button: give it to the page's main content.
    requestAnimationFrame(() => document.getElementById("main")?.focus());
    // Best effort: if it fails, the banner only comes back on the next page load.
    void fetch("/api/banner/dismiss", { method: "POST", body }).catch(() => undefined);
  };

  return (
    <aside aria-label={t("promo.bannerLabel")} className="bg-accent text-accent-foreground">
      <div className="mx-auto flex w-full max-w-content items-start gap-2 px-4 md:px-6">
        {banner.href ? (
          // The whole line is the link: one target of at least 44 px (S-062 AC8).
          <a href={localePath(locale, banner.href)} className="group flex min-h-11 min-w-0 flex-1 items-center py-1.5 wrap-anywhere">
            <span>
              <strong className="font-semibold text-primary-strong underline underline-offset-2 group-hover:text-link-hover">{title}</strong>
              {text && <span> {text}</span>}
            </span>
          </a>
        ) : (
          <p className="min-w-0 flex-1 py-2.5 wrap-anywhere">
            <strong className="font-semibold">{title}</strong>
            {text && <span> {text}</span>}
          </p>
        )}
        <form method="post" action="/api/banner/dismiss" onSubmit={dismiss} className="shrink-0">
          <input type="hidden" name="promotionId" value={banner.id} />
          <input type="hidden" name="next" value={`${location.pathname}${location.search}`} />
          <button
            type="submit"
            aria-label={t("promo.dismiss", { title })}
            className="inline-flex size-11 items-center justify-center rounded-md text-accent-foreground hover:bg-background/40"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </form>
      </div>
    </aside>
  );
}
