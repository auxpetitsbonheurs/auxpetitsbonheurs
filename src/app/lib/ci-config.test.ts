import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const ciPath = fileURLToPath(new URL("../../../.github/workflows/ci.yml", import.meta.url));
const ci = readFileSync(ciPath, "utf8");

describe("CI workflow (.github/workflows/ci.yml)", () => {
  test("S-235: a run on main is never cancelled by the next push (staging deploys only after a green run); other branches' superseded runs are", () => {
    expect(ci).toMatch(/^concurrency:\n {2}group: ci-\$\{\{ github\.ref \}\}\n {2}cancel-in-progress: \$\{\{ github\.ref != 'refs\/heads\/main' \}\}\n/m);
  });

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

  test("G-19: checks the client bundle for server secrets after the build", () => {
    expect(ci.indexOf("run: npm run check:client-secrets")).toBeGreaterThan(ci.indexOf("run: npm run build"));
  });

  test("G-19: scans the whole history with a pinned, checksum-verified gitleaks", () => {
    const scan = ci.slice(ci.indexOf("\n  secret-scan:"), ci.indexOf("\n  e2e:"));
    expect(scan).toContain("fetch-depth: 0");
    expect(scan).toMatch(/GITLEAKS_VERSION: \d+\.\d+\.\d+/);
    expect(scan).toMatch(/GITLEAKS_SHA256: [0-9a-f]{64}/);
    expect(scan.indexOf("sha256sum -c")).toBeLessThan(scan.indexOf("gitleaks\" git"));
    expect(scan).toContain("--redact");
    expect(scan).not.toMatch(/uses: (?!actions\/checkout@v5)/);
  });

  test("references no secrets, so a clean fork can run it", () => {
    expect(ci).not.toMatch(/secrets\./);
  });

  test("never lets a failing step pass", () => {
    expect(ci).not.toMatch(/continue-on-error:\s*true/);
    expect(ci).not.toMatch(/\|\|\s*true/);
  });
});

describe("docs-only commits (runner minutes)", () => {
  const job = (name: string, next: string) => ci.slice(ci.indexOf(`\n  ${name}:`), ci.indexOf(`\n  ${next}:`));
  const changes = job("changes", "app");

  test("every push still gets a ci run, so deploy.yml's green-ci gate is never left waiting", () => {
    expect(ci).not.toMatch(/paths(-ignore)?:/);
  });

  test("app and e2e run only when code changed; secret-scan always runs", () => {
    const gate = "if: needs.changes.outputs.code == 'true'";
    expect(job("app", "secret-scan")).toContain(gate);
    expect(ci.slice(ci.indexOf("\n  e2e:"))).toContain(gate);
    expect(job("secret-scan", "e2e")).not.toContain("needs:");
  });

  test("compares with the last commit whose ci passed, and runs everything when it cannot tell", () => {
    expect(changes).toContain("status=success");
    expect(changes).toContain("git merge-base --is-ancestor");
    expect(changes).toMatch(/No tested base found: running everything\."\n\s+echo "code=true"/);
  });

  test("docs that unit tests read count as code", () => {
    // PRD Appendix B: the transition table test reads it (S-115 AC8).
    expect(changes).toContain(String.raw`/^docs\/(design|runbooks)\// || /^docs\/architecture\/cpu-measurements\.md$/ || /^docs\/product\/prd\.md$/ { print; next }`);
    expect(changes).toContain(String.raw`/\.md$/ && !/^src\// { next }`);
  });
});

describe("CI e2e job (S-005 AC5)", () => {
  const e2e = ci.slice(ci.indexOf("\n  e2e:"));

  test("runs Playwright beside the unit-test job (it builds the app itself), on the same triggers, in shards", () => {
    expect(ci).toMatch(/\n {2}e2e:\n/);
    expect(e2e).not.toMatch(/needs:\s*\[?\s*app/);
    expect(e2e).toMatch(/needs:\s*changes/);
    expect(e2e).toMatch(/shard: \[1, 2\]/);
    expect(e2e).toContain("run: npm run test:e2e -- --shard=${{ matrix.shard }}/2");
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
