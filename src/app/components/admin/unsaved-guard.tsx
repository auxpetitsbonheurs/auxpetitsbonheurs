// Shared by the product editor and the Owner's Settings and Availability forms: the
// unsaved-changes guard (S-046 AC6) and keeping a focused field above a sticky Save bar.
import { type FocusEvent, Suspense, lazy, useEffect, useRef } from "react";
import { useBlocker } from "react-router";
import { Button } from "~/components/ui/button";
import { useI18n } from "~/i18n/react";

// Loaded after the page (JS budget: the product editor is near its limit); it is only shown
// when leaving with unsaved changes, long after this has arrived.
const Modal = lazy(() => import("~/components/ui/modal").then((module) => ({ default: module.Modal })));

/** Asks before leaving with unsaved changes (S-046 AC6): in-app links and closing the tab. */
export function useUnsavedGuard(dirty: boolean) {
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirtyRef.current && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!dirty) return;
    // Reads the ref: a Reload link that drops the changes on purpose clears it first.
    const warn = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  return { blocker, dirtyRef };
}

export function LeaveDialog({ blocker }: { blocker: ReturnType<typeof useBlocker> }) {
  const { t } = useI18n();
  const open = blocker.state === "blocked";
  return (
    <Suspense fallback={null}>
      <Modal open={open} onClose={() => blocker.reset?.()} title={t("admin.product.leaveTitle")} closeLabel={t("admin.states.close")} variant="dialog">
        <p>{t("admin.product.leaveBody")}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" onClick={() => blocker.reset?.()} className="flex-1">
            {t("admin.product.stay")}
          </Button>
          <Button type="button" variant="outline" onClick={() => blocker.proceed?.()} className="flex-1 border-destructive">
            {t("admin.product.leave")}
          </Button>
        </div>
      </Modal>
    </Suspense>
  );
}

/**
 * A focused control never stays under the sticky Save bar (WCAG 2.4.11). Browsers do not
 * scroll a control that is already partly visible, so `scroll-padding` alone leaves a tall
 * field's lower edge under the bar; this scrolls by the overlap.
 */
export function keepAboveSaveBar(event: FocusEvent<HTMLFormElement>) {
  const bar = event.currentTarget.querySelector<HTMLElement>("[data-editor-bar]");
  if (!bar || getComputedStyle(bar).position !== "sticky") return;
  const target = event.target as HTMLElement;
  // Fields only, typed into: a button is pressed where it is (scrolling would move it from under the finger).
  if (!target.matches("input:not([type=checkbox], [type=radio], [type=file]), textarea, select") || bar.contains(target)) return;
  const box = (target.closest("label") ?? target).getBoundingClientRect();
  const overlap = box.bottom - bar.getBoundingClientRect().top;
  if (overlap > 0 && box.top - overlap - 16 >= 0) window.scrollBy({ top: overlap + 16, behavior: "instant" });
}
