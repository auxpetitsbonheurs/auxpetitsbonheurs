import { memo, useEffect, useRef, useState } from "react";
import { useNavigation } from "react-router";
import { useI18n } from "~/i18n/react";
import { PAGE_CHANGE_MIN_VISIBLE_MS, SUBMISSION_DELAY_MS, createDelayedFlag, isPageChange } from "~/lib/delayed-flag";
import { sceneFor } from "~/lib/loader-scenes";
import { PAGE_LOADER_ID } from "~/lib/page-loader-script";
import { LoaderScenes } from "./loader-scenes";

/** The cream badge with its gold whisk and heart painted out (docs/design/brand/plain_badge.py). */
const BADGE_SRCSET = "/brand/badge-cream-plain-200.webp 200w, /brand/badge-cream-plain-400.webp 400w";
const BADGE_SIZES = "(min-width: 768px) 200px, 176px";

/** True while `active` (after `delayMs`), kept `minVisibleMs` once shown (lib/delayed-flag). */
function useDelayedFlag(active: boolean, delayMs: number, minVisibleMs: number): boolean {
  const [visible, setVisible] = useState(false);
  const flag = useRef<ReturnType<typeof createDelayedFlag> | null>(null);
  useEffect(() => {
    const created = createDelayedFlag({ delayMs, minVisibleMs, onChange: setVisible });
    flag.current = created;
    return () => created.dispose();
  }, [delayMs, minVisibleMs]);
  useEffect(() => flag.current?.set(active), [active]);
  return visible;
}

/** Gives the badge its srcset (it has none in the HTML, so it never competes with the LCP image). */
function loadBadge(root: HTMLElement) {
  const image = root.querySelector<HTMLImageElement>("img[data-srcset]");
  if (!image || image.srcset) return;
  image.sizes = image.dataset.sizes ?? "";
  image.srcset = image.dataset.srcset ?? "";
}

/** The same DOM steps as the full-page-load script (lib/page-loader-script.ts). */
function setShown(root: HTMLElement, shown: boolean) {
  const veil = root.querySelector("[data-page-loader-veil]");
  const text = root.querySelector("[data-page-loader-text]");
  if (!veil || !text) return;
  if (shown) {
    loadBadge(root);
    root.setAttribute("role", "status");
    veil.setAttribute("data-show", "");
    // Text a frame after the role, so screen readers announce it as a change of the status.
    requestAnimationFrame(() => (text.textContent = root.dataset.label ?? ""));
  } else {
    veil.removeAttribute("data-show");
    text.textContent = "";
    root.removeAttribute("role");
  }
}

/**
 * The overlay's markup, rendered once and never again (the effect and the full-page-load script
 * only toggle attributes): a full-screen cream veil with the plain cream badge and, over it, the
 * scene of the page being opened (`data-scene`, S-321; the whisk by default; app.css "S-317",
 * "S-321"). The veil is decorative (`aria-hidden`); the status text sits beside it.
 */
const LoaderMarkup = memo(function LoaderMarkup({ label }: { label: string }) {
  return (
    <div id={PAGE_LOADER_ID} data-label={label} data-scene="whisk" data-page-loader>
      <div aria-hidden="true" className="page-loader-veil" data-page-loader-veil>
        <div className="relative size-44 md:size-50" data-page-loader-badge>
          <img data-srcset={BADGE_SRCSET} data-sizes={BADGE_SIZES} alt="" width={200} height={200} decoding="async" className="size-full" />
          <LoaderScenes />
        </div>
      </div>
      <span className="sr-only" data-page-loader-text />
    </div>
  );
});

/**
 * Branded page loader (S-317, replaces S-284's small badge and the customer pages' thin bar).
 * A client page change shows it at once and keeps it PAGE_CHANGE_MIN_VISIBLE_MS; a navigating
 * form submission shows it after SUBMISSION_DELAY_MS (a quick validation answer never flashes
 * it); fetcher forms (Add to basket) never do. The first load never shows it: it starts hidden
 * and the router is idle at hydration. Full page loads before React starts are covered by the
 * inline script (lib/page-loader-script.ts) on the same markup.
 */
export function PageLoader() {
  const { t } = useI18n();
  const navigation = useNavigation();
  const pageChange = isPageChange(navigation);
  const submitting = navigation.state !== "idle" && !pageChange;
  const forPage = useDelayedFlag(pageChange, 0, PAGE_CHANGE_MIN_VISIBLE_MS);
  const forSubmission = useDelayedFlag(submitting, SUBMISSION_DELAY_MS, PAGE_CHANGE_MIN_VISIBLE_MS);
  const visible = forPage || forSubmission;
  const mounted = useRef(false);
  const destination = navigation.location?.pathname;

  // S-321: the scene follows the page being opened. Only while navigating: at hydration (idle) it
  // keeps the scene an early tap's full page load set, and after a navigation it keeps the last
  // one while the overlay fades out.
  useEffect(() => {
    if (destination) document.getElementById(PAGE_LOADER_ID)?.setAttribute("data-scene", sceneFor(destination));
  }, [destination]);

  useEffect(() => {
    const root = document.getElementById(PAGE_LOADER_ID);
    if (!root) return;
    // Not on mount: a full page load the script started may still be leaving the page.
    if (mounted.current) setShown(root, visible);
    else if (document.readyState === "complete") loadBadge(root);
    mounted.current = true;
  }, [visible]);

  return <LoaderMarkup label={t("shell.loading")} />;
}
