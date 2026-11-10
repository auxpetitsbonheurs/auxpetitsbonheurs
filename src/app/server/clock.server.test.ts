import { describe, expect, test } from "vitest";
import { TEST_CLOCK_COOKIE, createClock } from "./clock.server";

const FIXED = "2030-12-31T20:30:00.000Z";
const realNow = () => new Date("2026-11-10T08:00:00.000Z");

function request(cookie?: string) {
  return new Request("http://localhost/", cookie ? { headers: { cookie } } : undefined);
}

describe("createClock (S-005 AC6: injectable clock, test mode only)", () => {
  test("uses the real clock when the test clock is off, even if a cookie is sent", () => {
    const clock = createClock({ testClock: false }, request(`${TEST_CLOCK_COOKIE}=${FIXED}`), realNow);

    expect(clock.now().toISOString()).toBe("2026-11-10T08:00:00.000Z");
  });

  test("uses the cookie instant when the test clock is on", () => {
    const clock = createClock(
      { testClock: true },
      request(`other=1; ${TEST_CLOCK_COOKIE}=${encodeURIComponent(FIXED)}`),
      realNow,
    );

    expect(clock.now().toISOString()).toBe(FIXED);
  });

  test("falls back to the real clock when the cookie is missing or not an instant", () => {
    expect(createClock({ testClock: true }, request(), realNow).now()).toEqual(realNow());
    expect(
      createClock({ testClock: true }, request(`${TEST_CLOCK_COOKIE}=tomorrow`), realNow).now(),
    ).toEqual(realNow());
  });

  test("each call returns a fresh Date, so callers cannot mutate the clock", () => {
    const clock = createClock({ testClock: true }, request(`${TEST_CLOCK_COOKIE}=${FIXED}`), realNow);
    clock.now().setUTCFullYear(1999);

    expect(clock.now().toISOString()).toBe(FIXED);
  });
});
