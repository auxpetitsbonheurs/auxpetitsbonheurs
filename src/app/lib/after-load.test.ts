// Deferred work waits for the page's load event, then idle (S-254, S-276 AC7).
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { LOAD_CAP_MS, whenLoadedAndIdle } from "./after-load";

function stubPage(readyState: DocumentReadyState) {
  const page = Object.assign(new EventTarget(), {
    requestIdleCallback: (callback: () => void) => setTimeout(callback, 50) as unknown as number,
    cancelIdleCallback: (id: number) => clearTimeout(id),
  });
  vi.stubGlobal("window", page);
  vi.stubGlobal("document", { readyState });
  return page;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("whenLoadedAndIdle", () => {
  test("waits for the load event, then the idle moment, and runs once", () => {
    const page = stubPage("interactive");
    const run = vi.fn();
    whenLoadedAndIdle(run);
    vi.advanceTimersByTime(1000);
    expect(run).not.toHaveBeenCalled();
    page.dispatchEvent(new Event("load"));
    vi.advanceTimersByTime(50);
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(LOAD_CAP_MS);
    expect(run).toHaveBeenCalledTimes(1);
  });

  test("an already loaded page only waits for idle", () => {
    stubPage("complete");
    const run = vi.fn();
    whenLoadedAndIdle(run);
    vi.advanceTimersByTime(50);
    expect(run).toHaveBeenCalledTimes(1);
  });

  test("a load event that never comes still runs it after the cap", () => {
    stubPage("loading");
    const run = vi.fn();
    whenLoadedAndIdle(run);
    vi.advanceTimersByTime(LOAD_CAP_MS);
    expect(run).toHaveBeenCalledTimes(1);
  });

  test("cancelled (unmounted) before load, it never runs", () => {
    const page = stubPage("interactive");
    const run = vi.fn();
    whenLoadedAndIdle(run)();
    page.dispatchEvent(new Event("load"));
    vi.advanceTimersByTime(LOAD_CAP_MS);
    expect(run).not.toHaveBeenCalled();
  });
});
