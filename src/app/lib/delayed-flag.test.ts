// S-284 AC1, AC2: the page-change loader shows only when a navigation is still loading after
// 300 ms (fast pages never flash), and once shown it stays at least 300 ms (it never blinks).
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { LOADER_DELAY_MS, LOADER_MIN_VISIBLE_MS, PAGE_CHANGE_MIN_VISIBLE_MS, SUBMISSION_DELAY_MS, createDelayedFlag, isPageChange } from "./delayed-flag";

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

describe("S-317 page changes: at once, at least 450 ms", () => {
  let shown: boolean[];
  let pageChange: ReturnType<typeof createDelayedFlag>;

  beforeEach(() => {
    shown = [];
    pageChange = createDelayedFlag({ delayMs: 0, minVisibleMs: PAGE_CHANGE_MIN_VISIBLE_MS, onChange: (visible) => shown.push(visible) });
  });
  afterEach(() => pageChange.dispose());

  test("AC1: the constants: shown at once, kept 450 ms; navigating submissions wait 300 ms", () => {
    expect(PAGE_CHANGE_MIN_VISIBLE_MS).toBe(450);
    expect(SUBMISSION_DELAY_MS).toBe(300);
  });

  test("AC1: with no delay the overlay shows in the same tick the page change starts", () => {
    pageChange.set(true);
    expect(shown).toEqual([true]);
  });

  test("AC2: a page that is ready at once still keeps the overlay 450 ms, then hides it", () => {
    pageChange.set(true);
    vi.advanceTimersByTime(50);
    pageChange.set(false);
    vi.advanceTimersByTime(399);
    expect(shown).toEqual([true]);
    vi.advanceTimersByTime(1);
    expect(shown).toEqual([true, false]);
  });

  test("AC2: a slow page hides as soon as it is ready: never longer than the navigation plus the minimum", () => {
    pageChange.set(true);
    vi.advanceTimersByTime(2_000);
    pageChange.set(false);
    expect(shown).toEqual([true, false]);
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
