// S-284 AC1, AC2: the page-change loader shows only when a navigation is still loading after
// 300 ms (fast pages never flash), and once shown it stays at least 300 ms (it never blinks).
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { LOADER_DELAY_MS, LOADER_MIN_VISIBLE_MS, createDelayedFlag, isPageChange } from "./delayed-flag";

let changes: boolean[];
let flag: ReturnType<typeof createDelayedFlag>;

beforeEach(() => {
  vi.useFakeTimers();
  changes = [];
  flag = createDelayedFlag({ delayMs: LOADER_DELAY_MS, minVisibleMs: LOADER_MIN_VISIBLE_MS, onChange: (visible) => changes.push(visible) });
});

afterEach(() => {
  flag.dispose();
  vi.useRealTimers();
});

describe("createDelayedFlag", () => {
  test("the delays are about 300 ms", () => {
    expect(LOADER_DELAY_MS).toBe(300);
    expect(LOADER_MIN_VISIBLE_MS).toBe(300);
  });

  test("AC2: a navigation that ends before 300 ms never shows the loader", () => {
    flag.set(true);
    vi.advanceTimersByTime(299);
    flag.set(false);
    vi.advanceTimersByTime(5_000);
    expect(changes).toEqual([]);
    expect(flag.visible()).toBe(false);
  });

  test("AC1: a navigation still loading at 300 ms shows it, and it hides when the page has loaded", () => {
    flag.set(true);
    vi.advanceTimersByTime(300);
    expect(changes).toEqual([true]);
    expect(flag.visible()).toBe(true);

    vi.advanceTimersByTime(2_000);
    flag.set(false);
    expect(changes).toEqual([true, false]);
  });

  test("AC2: once shown it stays at least 300 ms, then hides", () => {
    flag.set(true);
    vi.advanceTimersByTime(300);
    vi.advanceTimersByTime(100);
    flag.set(false);
    expect(changes).toEqual([true]);
    vi.advanceTimersByTime(199);
    expect(flag.visible()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(changes).toEqual([true, false]);
  });

  test("a new navigation during the minimum keeps it shown without a blink", () => {
    flag.set(true);
    vi.advanceTimersByTime(300);
    flag.set(false);
    vi.advanceTimersByTime(100);
    flag.set(true);
    vi.advanceTimersByTime(1_000);
    expect(changes).toEqual([true]);
    flag.set(false);
    expect(changes).toEqual([true, false]);
  });

  test("repeated set(true) does not restart the delay", () => {
    flag.set(true);
    vi.advanceTimersByTime(200);
    flag.set(true);
    vi.advanceTimersByTime(100);
    expect(changes).toEqual([true]);
  });

  test("dispose cancels a pending show", () => {
    flag.set(true);
    flag.dispose();
    vi.advanceTimersByTime(1_000);
    expect(changes).toEqual([]);
  });
});

describe("isPageChange (AC7)", () => {
  test.each([
    [{ state: "idle" }, false],
    [{ state: "loading" }, true],
    [{ state: "loading", formMethod: "POST" }, false],
    [{ state: "submitting", formMethod: "POST" }, false],
    [{ state: "loading", formMethod: "GET" }, false],
  ] as const)("%j -> %s", (navigation, expected) => {
    expect(isPageChange(navigation)).toBe(expected);
  });
});
