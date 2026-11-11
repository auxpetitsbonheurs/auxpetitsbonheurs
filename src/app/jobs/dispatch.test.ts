// Scheduled-job dispatcher (S-020 AC4): one failing job never stops the others, and the
// dispatcher itself never throws.
import { afterEach, describe, expect, test, vi } from "vitest";
import { type Job, JOBS, dispatch } from "./dispatch";

const env = {
  APP_ENV: "development",
  APP_TIME_ZONE: "Indian/Mauritius",
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/never_connected",
};
const ctx = { waitUntil: vi.fn() };
const now = new Date("2026-11-15T22:00:00Z");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("dispatch (AC4)", () => {
  test("runs every job; a throwing job is returned as ran: false with its error and logged as one structured line", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const seen: Date[] = [];
    const jobs: Job[] = [
      { name: "broken", run: async () => Promise.reject(new Error("boom at postgresql://user:pw@host/db")) },
      { name: "fine", run: async ({ now: at }) => (seen.push(at), { job: "fine", ran: true, processed: 2 }) },
    ];

    const results = await dispatch(now, env, ctx, jobs);

    expect(results).toEqual([
      { job: "broken", ran: false, error: "Error: boom at [url]" },
      { job: "fine", ran: true, processed: 2 },
    ]);
    expect(seen).toEqual([now]);
    const lines = log.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);
    expect(lines).toContainEqual({ level: "error", event: "job", job: "broken", ran: false, error: "Error: boom at [url]" });
    expect(lines).toContainEqual({ level: "info", event: "job", job: "fine", ran: true, processed: 2 });
    expect(JSON.stringify(lines)).not.toContain("pw@");
  });

  test("never throws, even when the bindings are invalid", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});

    const results = await dispatch(now, { APP_ENV: "staging" }, ctx, []);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ job: "dispatch", ran: false });
    expect(String((results[0] as { error: string }).error)).toMatch(/SUPABASE_URL/);
  });

  test("keepAlive, the missing-integrations check and the rate-limit purge run on every hourly tick", () => {
    expect(JOBS.map((job) => job.name)).toEqual(["keepAlive", "integrations", "purgeRateLimits"]);
  });
});
