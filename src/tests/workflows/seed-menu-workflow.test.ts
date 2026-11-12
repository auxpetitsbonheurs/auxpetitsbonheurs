// S-241 AC10: the manual seed-menu workflow (.github/workflows/seed-menu.yml): staging only,
// secrets by name, never echoed, and a missing secret is named before anything is written.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));
const workflow = readFileSync(path("../../../.github/workflows/seed-menu.yml"), "utf8");
const SECRETS = ["STAGING_DATABASE_URL", "STAGING_SUPABASE_URL", "STAGING_SUPABASE_SERVICE_ROLE_KEY"];
/** A stand-in value (not a real secret) that must never appear in the output. */
const STAND_IN = "stand-in-value-7f3a";

describe("seed-menu workflow", () => {
  test("runs only by hand, from main, in the staging environment", () => {
    expect(workflow).toMatch(/^on:\s*\n\s+workflow_dispatch:\s*$/m);
    expect(workflow).not.toMatch(/^\s+(push|schedule|workflow_run|pull_request):/m);
    expect(workflow).toMatch(/^\s+environment: staging$/m);
    expect(workflow).toContain("if: github.ref == 'refs/heads/main'");
    expect(workflow).not.toMatch(/production/i);
  });

  test("uses the staging secrets by name and runs the script with APP_ENV=staging", () => {
    const secrets = [...workflow.matchAll(/secrets\.([A-Z_]+)/g)].map((m) => m[1]);
    expect(new Set(secrets)).toEqual(new Set(SECRETS));
    expect(workflow).toContain("APP_ENV: staging");
    expect(workflow).toContain("DATABASE_URL: ${{ secrets.STAGING_DATABASE_URL }}");
    expect(workflow).toContain("SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.STAGING_SUPABASE_SERVICE_ROLE_KEY }}");
    expect(workflow).toContain("run: npm run seed:menu");
  });

  test("checks every secret (names only) before installing or writing anything", () => {
    const check = workflow.indexOf(`scripts/check-keys.sh --require ${SECRETS.join(" ")}`);
    expect(check).toBeGreaterThan(0);
    expect(check).toBeLessThan(workflow.indexOf("run: npm ci"));
    expect(check).toBeLessThan(workflow.indexOf("run: npm run seed:menu"));
  });

  test("never echoes a secret and keeps no git credentials", () => {
    expect(workflow).not.toMatch(/(echo|printf|cat)[^\n]*(secrets\.|\$[A-Z_]*(KEY|URL))/);
    expect(workflow).not.toMatch(/set -x|ACTIONS_STEP_DEBUG/);
    expect(workflow).toContain("persist-credentials: false");
  });

  test("the check names a missing secret, never a value, and fails", () => {
    const run = spawnSync("bash", [path("../../scripts/check-keys.sh"), "--require", ...SECRETS], {
      env: { PATH: process.env.PATH ?? "", STAGING_DATABASE_URL: STAND_IN, STAGING_SUPABASE_URL: STAND_IN } as unknown as NodeJS.ProcessEnv,
      encoding: "utf8",
    });
    expect(run.status).toBe(1);
    expect(run.stdout + run.stderr).toContain("STAGING_SUPABASE_SERVICE_ROLE_KEY");
    expect(run.stdout + run.stderr).not.toContain(STAND_IN);
  });
});

describe("seed:menu script", () => {
  test.each([
    ["production", /only with APP_ENV=staging/],
    ["staging", /Missing: DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY\. Nothing was written\./],
  ])("APP_ENV=%s without what it needs stops before connecting", (appEnv, message) => {
    const run = spawnSync("npx", ["tsx", path("../../scripts/seed-menu.ts")], {
      cwd: path("../.."),
      env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", APP_ENV: appEnv } as unknown as NodeJS.ProcessEnv,
      encoding: "utf8",
      timeout: 60_000,
    });
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(message);
  }, 70_000);
});
