// S-019 (risk T3, NFR-009): CPU sample summaries and the cpu-measurements.md report.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { CPU_LIMIT_MS, EmptySamplesError, HOT_PATHS, classifyHotPath, parseCpuSamples, renderCpuReport, summarizeCpu } from "./cpu-report";

describe("summarizeCpu (AC1)", () => {
  test("count, nearest-rank p50/p99 and max; pass when p99 is under 10 ms", () => {
    const samples = Array.from({ length: 100 }, (_, i) => i / 10 + 0.1); // 0.1 .. 10.0

    expect(summarizeCpu(samples)).toEqual({ count: 100, p50: 5, p99: 9.9, max: 10, verdict: "pass" });
  });

  test("nearest rank on a small, unsorted list", () => {
    expect(summarizeCpu([3, 1, 2])).toEqual({ count: 3, p50: 2, p99: 3, max: 3, verdict: "pass" });
  });

  test("p99 at or above the 10 ms limit fails", () => {
    expect(CPU_LIMIT_MS).toBe(10);
    expect(summarizeCpu([1, 10]).verdict).toBe("fail");
    expect(summarizeCpu([9.99]).verdict).toBe("pass");
  });

  test("an empty list throws a typed error", () => {
    expect(() => summarizeCpu([])).toThrow(EmptySamplesError);
  });
});

const many = (ms: number, n = 50) => Array.from({ length: n }, () => ms);

describe("renderCpuReport (AC2, AC4)", () => {
  test("one table per hot path with cold and warm rows, count, p50, p99, max, verdict and the date", () => {
    const report = renderCpuReport({
      date: "2026-11-20",
      environment: "staging",
      results: HOT_PATHS.map((path) => ({ path: path.id, cold: many(6, 5), warm: many(2) })),
    });

    for (const path of HOT_PATHS) expect(report).toContain(`### ${path.label}`);
    expect(report).toContain("| Phase | Count | p50 (ms) | p99 (ms) | Max (ms) | Verdict |");
    expect(report).toContain("| Cold | 5 | 6 | 6 | 6 | pass |");
    expect(report).toContain("| Warm | 50 | 2 | 2 | 2 | pass |");
    expect(report).toContain("Measured: 2026-11-20 on staging");
    expect(report).toMatch(/Overall: PASS/);
    expect(report).not.toMatch(/Workers Paid/);
  });

  test("any hot path with p99 at or above 10 ms marks FAIL and asks the Owner to decide on Workers Paid", () => {
    const report = renderCpuReport({
      date: "2026-11-20",
      environment: "staging",
      results: HOT_PATHS.map((path, i) => ({ path: path.id, cold: many(4, 5), warm: i === 0 ? [...many(3, 49), 12] : many(2) })),
    });

    expect(report).toContain("| Warm | 50 | 3 | 12 | 12 | FAIL |");
    expect(report).toMatch(/Overall: FAIL/);
    expect(report).toMatch(/Owner decision needed.*Workers Paid \(\$5\/month\).*NFR-009/s);
    expect(report).toMatch(/nothing has been bought or configured/i);
  });

  test("a phase with no samples is shown as not measured and the report stays pending", () => {
    const report = renderCpuReport({ date: null, environment: "staging", results: [] });

    for (const path of HOT_PATHS) expect(report).toContain(`### ${path.label}`);
    expect(report).toContain("| Cold | 0 | - | - | - | not measured |");
    expect(report).toMatch(/Overall: PENDING/);
    expect(report).toContain("Measured: not yet");
  });
});

describe("classifyHotPath and parseCpuSamples (log input)", () => {
  test("maps requests to the three hot paths, either language, and reads the phase tag", () => {
    expect(classifyHotPath("POST", "https://x.workers.dev/basket?cpu=warm")).toEqual({ path: "checkout-submit", phase: "warm" });
    expect(classifyHotPath("GET", "https://x.workers.dev/fr/basket?cpu=cold")).toEqual({ path: "basket", phase: "cold" });
    expect(classifyHotPath("GET", "https://x.workers.dev/t/abcDEF_-123?cpu=warm")).toEqual({ path: "tracking", phase: "warm" });
    expect(classifyHotPath("GET", "https://x.workers.dev/menu/cake?cpu=warm")).toBeNull();
    expect(classifyHotPath("GET", "https://x.workers.dev/basket")).toBeNull();
  });

  test("reads CSV rows and JSON lines (wrangler tail / Workers Logs export) and skips other requests", () => {
    const csv = "path,phase,cpu_ms\ncheckout-submit,warm,3.5\nbasket,cold,7\n";
    const jsonl = [
      JSON.stringify({ cpuTime: 2.25, event: { request: { method: "GET", url: "https://x/t/tok?cpu=warm" } } }),
      JSON.stringify({ $workers: { cpuTimeMs: 4, event: { request: { method: "POST", url: "https://x/basket?cpu=cold" } } } }),
      JSON.stringify({ cpuTime: 1, event: { request: { method: "GET", url: "https://x/menu/cake" } } }),
      "",
    ].join("\n");

    expect(parseCpuSamples(csv)).toEqual([
      { path: "checkout-submit", phase: "warm", cpuMs: 3.5 },
      { path: "basket", phase: "cold", cpuMs: 7 },
    ]);
    expect(parseCpuSamples(jsonl)).toEqual([
      { path: "tracking", phase: "warm", cpuMs: 2.25 },
      { path: "checkout-submit", phase: "cold", cpuMs: 4 },
    ]);
  });
});

describe("docs/architecture/cpu-measurements.md (AC3 evidence file)", () => {
  const evidence = readFileSync(fileURLToPath(new URL("../../../docs/architecture/cpu-measurements.md", import.meta.url)), "utf8");

  test.each(HOT_PATHS.map((p) => p.label))("has a section for %s", (label) => {
    expect(evidence).toContain(`### ${label}`);
  });
});

describe("samplesCsv (what gets committed instead of raw logs)", () => {
  test("keeps only path, phase and CPU time, and round-trips through parseCpuSamples", async () => {
    const { samplesCsv } = await import("./cpu-report");
    const samples = [{ path: "tracking" as const, phase: "warm" as const, cpuMs: 2.5 }];

    expect(samplesCsv(samples)).toBe("path,phase,cpu_ms\ntracking,warm,2.5\n");
    expect(parseCpuSamples(samplesCsv(samples))).toEqual(samples);
  });
});
