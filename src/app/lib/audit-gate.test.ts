import { describe, expect, test } from "vitest";
import { auditProblems, blockingAdvisories } from "./audit-gate";

const report = (entries: Record<string, [string, string][]>) => ({
  vulnerabilities: Object.fromEntries(
    Object.entries(entries).map(([name, vias]) => [name, { severity: "high", via: vias.map(([id, severity]) => ({ url: `https://github.com/advisories/${id}`, severity })) }]),
  ),
});
const NONE = { vulnerabilities: {} };
const TODAY = "2026-11-18";

describe("dependency audit gate (G-18)", () => {
  test("only high and critical advisories block", () => {
    expect([...blockingAdvisories(report({ a: [["GHSA-aaaa", "high"], ["GHSA-bbbb", "moderate"]], b: [["GHSA-cccc", "critical"]] }))]).toEqual(["GHSA-aaaa", "GHSA-cccc"]);
  });

  test("a dev-only high advisory fails without an exception", () => {
    expect(auditProblems(report({ picomatch: [["GHSA-aaaa", "high"]] }), NONE, [], TODAY)).toEqual([expect.stringContaining("GHSA-aaaa")]);
  });

  test("a dev-only advisory with a live exception passes; an expired one fails", () => {
    const all = report({ picomatch: [["GHSA-aaaa", "high"]] });
    expect(auditProblems(all, NONE, [{ advisory: "GHSA-aaaa", reason: "no fix", expires: "2026-12-18" }], TODAY)).toEqual([]);
    expect(auditProblems(all, NONE, [{ advisory: "GHSA-aaaa", reason: "no fix", expires: "2026-11-17" }], TODAY)).toEqual([expect.stringMatching(/expired/)]);
  });

  test("an exception never excuses an advisory in a runtime dependency", () => {
    const all = report({ pg: [["GHSA-aaaa", "high"]] });
    expect(auditProblems(all, all, [{ advisory: "GHSA-aaaa", reason: "x", expires: "2099-01-01" }], TODAY)).toEqual([expect.stringMatching(/runtime/)]);
  });
});
