// Work that can wait (prefetching the basket's code, warming the menu cache) runs once the page
// has loaded, photos included, and the browser is idle (S-254, S-276 AC7). Idle alone came
// before the LCP photo had arrived on a slow phone connection, so the extra requests shared its
// bandwidth. A page whose load event never comes (a stalled photo) still runs it after LOAD_CAP_MS.

export const LOAD_CAP_MS = 8000;

/** Runs `run` once, after the window's load event and the next idle moment; returns a cancel function. */
export function whenLoadedAndIdle(run: () => void, idleTimeoutMs = 2000): () => void {
  let state: "waiting" | "idle" | "done" = "waiting";
  let cancelIdle = () => {};
  const once = () => {
    if (state === "done") return;
    state = "done";
    run();
  };
  const idle = () => {
    if (state !== "waiting") return;
    state = "idle";
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(once, { timeout: idleTimeoutMs });
      cancelIdle = () => window.cancelIdleCallback(id);
    } else {
      const timer = setTimeout(once, 200);
      cancelIdle = () => clearTimeout(timer);
    }
  };
  const cap = setTimeout(once, LOAD_CAP_MS);
  if (document.readyState === "complete") idle();
  else window.addEventListener("load", idle, { once: true });
  return () => {
    state = "done";
    clearTimeout(cap);
    window.removeEventListener("load", idle);
    cancelIdle();
  };
}
