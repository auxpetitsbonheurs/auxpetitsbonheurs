import { useEffect, useRef, useState } from "react";
import { useNavigation } from "react-router";
import { useI18n } from "~/i18n/react";
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

/**
 * The logo badge's heart flourish and whisk (public/brand/logo-badge-*.svg, brand v0.3), on a
 * small burgundy disc with the gold ring. The whisk rocks about the end of its handle, where
 * it meets the flourish (app.css `animate-whisk`; still under reduced motion).
 */
function WhiskBadge() {
  return (
    <svg aria-hidden="true" viewBox="0 0 120 120" className="size-16 drop-shadow-md" data-page-loader-badge>
      <circle cx="60" cy="60" r="57" className="fill-band stroke-gold" strokeWidth="3" />
      <circle cx="60" cy="60" r="52.5" fill="none" className="stroke-gold" strokeOpacity=".5" strokeWidth=".8" />
      <g transform="translate(60 60) scale(.92) translate(-136.5 -52.5)" fill="none" className="stroke-gold" strokeLinecap="round" strokeLinejoin="round">
        <path strokeWidth="2.6" d="M92 70.8c12.6 7.2 28.8 9 45 5.4-5.4-6.3-13.5-12.6-12.6-21.6.9-7.2 9-9 12.6-.9 3.6-8.1 11.7-6.3 12.6.9.9 9-7.2 15.3-12.6 21.6 6.3-1.8 11.7 0 17.1-2.7" />
        <g transform="translate(154.1 73.5)">
          <g className="animate-whisk" data-whisk>
            <g transform="translate(-154.1 -73.5)">
              <path strokeWidth="5" d="m154.1 73.5 8.1-9.9" />
              <path strokeWidth="3.6" d="m160.1 62.5 4.2 2.2" />
              <path strokeWidth="1.6" d="M162.2 63.6c-3.6-12.1 5.4-36.2 18.9-35.1m-18.9 35.1c.3-10 10.9-33.3 18.9-35.1m-18.9 35.1 18.9-35.1m-18.9 35.1c8.2-5.8 21.8-27.4 18.9-35.1m-18.9 35.1c12.1-3.7 27.2-24.5 18.9-35.1" />
            </g>
          </g>
        </g>
      </g>
    </svg>
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
      {visible && (
        <>
          <span className="animate-loader-in">
            <WhiskBadge />
          </span>
          <span className="sr-only">{t("shell.loading")}</span>
        </>
      )}
    </div>
  );
}
