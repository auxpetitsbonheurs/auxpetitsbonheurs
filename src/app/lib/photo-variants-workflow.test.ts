// S-276 AC8: the photo-variants workflow (.github/workflows/photo-variants.yml) is manual,
// staging-only by construction and least privilege, like seed-menu.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const workflow = readFileSync(fileURLToPath(new URL("../../../.github/workflows/photo-variants.yml", import.meta.url)), "utf8");
const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("../../package.json", import.meta.url)), "utf8")) as { scripts: Record<string, string> };

describe("photo-variants workflow", () => {
  test("runs only when started by hand, from main", () => {
    expect(workflow).toMatch(/^on:\n {2}workflow_dispatch:\n\n/m);
    expect(workflow).not.toMatch(/^\s{2}(push|pull_request|schedule|workflow_run):/m);
    expect(workflow).toContain("if: github.ref == 'refs/heads/main'");
  });

  test("bound to the staging GitHub Environment with only STAGING_* secrets and APP_ENV=staging", () => {
    expect(workflow).toContain("environment: staging");
    expect(workflow).not.toMatch(/production/i);
    const secrets = [...workflow.matchAll(/secrets\.([A-Z_]+)/g)].map((m) => m[1]!);
    expect(secrets.length).toBeGreaterThan(0);
    expect(secrets.every((name) => name.startsWith("STAGING_"))).toBe(true);
    expect(workflow).toContain("APP_ENV: staging");
  });

  test("least privilege, no persisted git credentials, one run at a time", () => {
    expect(workflow).toMatch(/^permissions:\n {2}contents: read\n/m);
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toMatch(/concurrency:\n\s+group: photo-variants-staging\n\s+cancel-in-progress: false/);
  });

  test("runs the backfill script", () => {
    expect(workflow).toContain("run: npm run backfill:photo-variants");
    expect(pkg.scripts["backfill:photo-variants"]).toBe("tsx scripts/backfill-photo-variants.ts");
  });
});
