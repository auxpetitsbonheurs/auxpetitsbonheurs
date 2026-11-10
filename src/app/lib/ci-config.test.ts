import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const ciPath = fileURLToPath(new URL("../../../.github/workflows/ci.yml", import.meta.url));
const ci = readFileSync(ciPath, "utf8");

describe("CI workflow (.github/workflows/ci.yml)", () => {
  test("runs on pull requests and pushes to main", () => {
    expect(ci).toMatch(/^\s{2}pull_request:/m);
    expect(ci).toMatch(/^\s{2}push:\s*\n\s{4}branches:\s*\[\s*main\s*\]/m);
  });

  test("runs lint, typecheck, unit tests, build and the JS budget in that order", () => {
    const steps = [
      "npm ci",
      "npm run lint",
      "npm run typecheck",
      "npm test",
      "npm run build",
      "npm run check:js-budget",
    ];
    const positions = steps.map((step) => ci.indexOf(`run: ${step}`));

    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  test("references no secrets, so a clean fork can run it", () => {
    expect(ci).not.toMatch(/secrets\./);
  });

  test("never lets a failing step pass", () => {
    expect(ci).not.toMatch(/continue-on-error:\s*true/);
    expect(ci).not.toMatch(/\|\|\s*true/);
  });
});
