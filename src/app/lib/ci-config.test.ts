import { readFileSync, readdirSync } from "node:fs";
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

describe("CI e2e job (S-005 AC5)", () => {
  const e2e = ci.slice(ci.indexOf("\n  e2e:"));

  test("runs Playwright after the unit-test job, on the same triggers", () => {
    expect(ci).toMatch(/\n {2}e2e:\n/);
    expect(e2e).toMatch(/needs:\s*app/);
    expect(e2e).toContain("run: npm run test:e2e");
  });

  test("gets a throwaway Postgres service matching the e2e wrangler environment", () => {
    expect(e2e).toMatch(/services:\s*\n\s+postgres:\s*\n\s+image:\s*postgres:16/);
    expect(e2e).toContain("POSTGRES_PASSWORD: postgres");
  });

  test("the Postgres health check connects as the service's user (not the container's root)", () => {
    expect(e2e).toMatch(/--health-cmd "pg_isready -U postgres"/);
  });

  test("installs only Chromium, without an unconditional apt run, and keeps traces of failed runs", () => {
    // CI runs 43031233818 and 43039279359: `--with-deps` runs apt-get update, whose mirrors did not resolve.
    expect(e2e).toMatch(/run: npx playwright install chromium\n/);
    expect(e2e).not.toContain("--with-deps");
    expect(e2e).toContain("run: scripts/ensure-browser-deps.sh");
    expect(e2e.indexOf("npx playwright install chromium")).toBeLessThan(e2e.indexOf("ensure-browser-deps.sh"));
    expect(e2e.indexOf("ensure-browser-deps.sh")).toBeLessThan(e2e.indexOf("run: npm run test:e2e"));
    expect(e2e).toMatch(/if:\s*failure\(\)/);
    expect(e2e).toContain("test-results");
  });
});

describe("Playwright web server readiness (CI run 42870481246)", () => {
  // Playwright starts web servers before global setup, and global setup is what creates the
  // e2e database. A readiness probe that renders a page (which reads the database) answers
  // 500 on a fresh Postgres until the 180 s timeout, so it must probe a static asset.
  const config = readFileSync(fileURLToPath(new URL("../../playwright.config.ts", import.meta.url)), "utf8");

  test("the app server is ready when a static asset answers, before the database exists", () => {
    expect(config).toMatch(/READY_URL = `\$\{baseURL\}\/favicon\.ico`/);
    expect(config).toMatch(/url: READY_URL,/);
    expect(config).not.toMatch(/url: baseURL,/);
  });

  test("the probed asset ships with the build", () => {
    expect(() => readFileSync(fileURLToPath(new URL("../../public/favicon.ico", import.meta.url)))).not.toThrow();
  });
});

describe("e2e specs (S-005 AC5)", () => {
  const dir = fileURLToPath(new URL("../../tests/e2e", import.meta.url));
  const specs = readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".ts"));

  test.each(specs)("%s has no fixed sleeps", (file) => {
    const source = readFileSync(`${dir}/${file}`, "utf8");

    expect(source).not.toMatch(/waitForTimeout\(|setTimeout\(/);
  });
});
