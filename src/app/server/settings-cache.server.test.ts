// Settings change rarely (admin edits) but every customer page reads them: each isolate keeps
// the last values for a short TTL so most pages skip that database round trip.
import { describe, expect, test, vi } from "vitest";
import { SETTINGS_TTL_MS, createTtlCache } from "./settings-cache.server";

describe("createTtlCache", () => {
  test("loads once, then serves the stored value until the TTL passes", async () => {
    let now = 1_000;
    const cache = createTtlCache<number>(SETTINGS_TTL_MS, () => now);
    const load = vi.fn(async () => now);

    expect(await cache.get(load)).toBe(1_000);
    now += SETTINGS_TTL_MS - 1;
    expect(await cache.get(load)).toBe(1_000);
    expect(load).toHaveBeenCalledTimes(1);

    now += 1;
    expect(await cache.get(load)).toBe(now);
    expect(load).toHaveBeenCalledTimes(2);
  });

  test("a failed load is not stored", async () => {
    const cache = createTtlCache<number>(60_000, () => 0);
    await expect(cache.get(async () => Promise.reject(new Error("db down")))).rejects.toThrow("db down");

    expect(await cache.get(async () => 7)).toBe(7);
  });

  test("concurrent misses each load for themselves (Workers cannot share a pending promise across requests)", async () => {
    const cache = createTtlCache<number>(60_000, () => 0);
    const load = vi.fn(async () => 1);

    await Promise.all([cache.get(load), cache.get(load)]);
    expect(load).toHaveBeenCalledTimes(2);
  });

  test("clear forgets the stored value", async () => {
    const cache = createTtlCache<number>(60_000, () => 0);
    await cache.get(async () => 1);
    cache.clear();

    expect(await cache.get(async () => 2)).toBe(2);
  });

  test("the TTL is short: at most one minute", () => {
    expect(SETTINGS_TTL_MS).toBeGreaterThan(0);
    expect(SETTINGS_TTL_MS).toBeLessThanOrEqual(60_000);
  });
});
