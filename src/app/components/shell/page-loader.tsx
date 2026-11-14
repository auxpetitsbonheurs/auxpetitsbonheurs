import { useEffect, useRef, useState } from "react";
import { useNavigation } from "react-router";
import { useI18n } from "~/i18n/react";
import { badgeImage } from "~/lib/brand";
import { cn } from "~/lib/utils";
import { LOADER_DELAY_MS, LOADER_MIN_VISIBLE_MS, createDelayedFlag, isPageChange } from "~/lib/delayed-flag";

/** True LOADER_DELAY_MS after `active` starts, kept LOADER_MIN_VISIBLE_MS once shown (lib/delayed-flag). */
function useDelayedFlag(active: boolean): boolean {
  const [visible, setVisible] = useState(false);
  const flag = useRef<ReturnType<typeof createDelayedFlag> | null>(null);
  useEffect(() => {
    const created = createDelayedFlag({ delayMs: LOADER_DELAY_MS, minVisibleMs: LOADER_MIN_VISIBLE_MS, onChange: setVisible });
    flag.current = created;
    return () => created.dispose();
  }, []);
  useEffect(() => flag.current?.set(active), [active]);
  return visible;
}

const loaderBadge = badgeImage("burgundy", 80);

/**
 * The Owner's burgundy badge (lib/brand; it stands out on the cream pages), 80 px, with a thin
 * gold arc circling just outside its ring while the badge pulses softly (app.css
 * `animate-loader-ring`, `animate-loader-pulse`; both still under reduced motion). Mounted,
 * invisible, as soon as a page change starts so the image is ready when it shows; it gets
 * `data-page-loader-badge` only once shown.
 */
function LoaderBadge({ shown }: { shown: boolean }) {
  return (
    <span aria-hidden="true" className={cn("relative block size-20", shown ? "animate-loader-in" : "invisible")} {...(shown ? { "data-page-loader-badge": "" } : {})}>
      <img {...loaderBadge} sizes="80px" alt="" width={80} height={80} decoding="async" className="size-20 animate-loader-pulse rounded-full drop-shadow-md" />
      <span className="absolute -inset-1.5 animate-loader-ring rounded-full border-2 border-transparent border-t-gold border-r-gold/40" data-loader-ring />
    </span>
  );
}

/**
 * Branded page-change loader (S-284). Exists only while a client page change loads (never on
 * the first load: the router is idle at hydration). The status region mounts empty when the
 * change starts and gets its text and the badge after LOADER_DELAY_MS, so screen readers
 * announce "Loading…" and fast pages show nothing. Fixed and click-through: no layout shift.
 */
export function PageLoader() {
  const { t } = useI18n();
  const navigating = isPageChange(useNavigation());
  const visible = useDelayedFlag(navigating);
  if (!navigating && !visible) return null;
  return (
    <div role="status" className="pointer-events-none fixed inset-0 z-50 grid place-items-center" data-page-loader>
      <LoaderBadge shown={visible} />
      {visible && <span className="sr-only">{t("shell.loading")}</span>}
    </div>
  );
}
