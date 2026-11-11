// Server-Timing (perf investigation, staging "Add to basket" report): per-request
// durations for the database connection, each named read and the app, with no SQL,
// parameters or personal data in the header.
import { describe, expect, test } from "vitest";
import { RouterContextProvider } from "react-router";
import { ServerTiming, serverTimingContext, timed } from "./server-timing.server";

function clock(...ticks: number[]) {
  let i = 0;
  return () => ticks[Math.min(i++, ticks.length - 1)]!;
}

describe("ServerTiming", () => {
  test("formats entries as name;dur=ms with whole-ish milliseconds", () => {
    const timing = new ServerTiming();
    timing.add("db-connect", 812.345);
    timing.add("app", 1000.06);

    expect(timing.header()).toBe("db-connect;dur=812.3, app;dur=1000.1");
  });

  test("names are reduced to safe tokens and descriptions are quoted plain words", () => {
    const timing = new ServerTiming();
    timing.add("select * from \"orders\" where email='a@b.c'", 1, "2 queries; \"x\"");

    const header = timing.header();
    expect(header).toMatch(/^[a-z0-9-]+;dur=1;desc="[a-z0-9 ]+"$/);
    expect(header).not.toContain("@");
    expect(header).not.toContain("'");
  });

  test("measure times an async step, even when it throws", async () => {
    const timing = new ServerTiming(clock(10, 35, 100, 160));
    await timing.measure("product", async () => "ok");
    await expect(timing.measure("basket", async () => Promise.reject(new Error("x")))).rejects.toThrow("x");

    expect(timing.header()).toBe("product;dur=25, basket;dur=60");
  });

  test("the same name twice gets a numbered suffix so both stay visible", () => {
    const timing = new ServerTiming();
    timing.add("settings", 1);
    timing.add("settings", 2);

    expect(timing.header()).toBe("settings;dur=1, settings-2;dur=2");
  });

  test("an empty timing has no header", () => {
    expect(new ServerTiming().header()).toBeNull();
  });
});

describe("timed", () => {
  test("records into the request's timing when there is one", async () => {
    const context = new RouterContextProvider();
    const timing = new ServerTiming(clock(0, 5));
    context.set(serverTimingContext, timing);

    expect(await timed(context, "footer", async () => 42)).toBe(42);
    expect(timing.header()).toBe("footer;dur=5");
  });

  test("just runs the step when the request has no timing (unit tests, jobs)", async () => {
    expect(await timed(new RouterContextProvider(), "footer", async () => 42)).toBe(42);
  });
});
