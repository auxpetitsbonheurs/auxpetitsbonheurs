// S-002 AC2: the deploy workflow (.github/workflows/deploy.yml). Staging after CI passes on
// main, production when the `production` branch moves to a commit staging already runs;
// migrations before each deploy; secrets by name only; skips cleanly until keys exist.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const workflow = readFileSync(fileURLToPath(new URL("../../../.github/workflows/deploy.yml", import.meta.url)), "utf8");
const job = (name: string) => {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  const rest = workflow.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z-]+:\n/);
  return start < 0 ? "" : next < 0 ? rest : rest.slice(0, next + 1);
};

describe("deploy workflow triggers (AC2)", () => {
  test("staging runs after the ci workflow completes on main; production on a push to the production branch", () => {
    expect(workflow).toMatch(/workflow_run:\s*\n\s+workflows:\s*\[\s*ci\s*\]\s*\n\s+types:\s*\[\s*completed\s*\]\s*\n\s+branches:\s*\[\s*main\s*\]/);
    expect(workflow).toMatch(/push:\s*\n\s+branches:\s*\[\s*production\s*\]/);
  });

  test("staging deploys only a green CI run of a push, at the commit CI tested", () => {
    expect(job("staging-preflight")).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(job("staging-preflight")).toContain("github.event.workflow_run.event == 'push'");
    expect(job("staging")).toContain("ref: ${{ github.event.workflow_run.head_sha || github.sha }}");
    expect(job("staging")).toMatch(/environment:\s*\n\s+name:\s*staging/);
  });

  test("production first checks that staging already runs this commit", () => {
    const preflight = job("production-preflight");
    expect(preflight).toContain("environment=staging");
    expect(preflight).toMatch(/state\s*==\s*"success"/);
    expect(job("production")).toMatch(/environment:\s*\n\s+name:\s*production/);
  });

  test("deploys never cancel each other half-way", () => {
    expect(workflow).toMatch(/cancel-in-progress:\s*false/);
  });
});

describe("deploy workflow steps (AC2)", () => {
  test.each([
    ["staging", "STAGING_DATABASE_URL", "npm run deploy:staging"],
    ["production", "PRODUCTION_DATABASE_URL", "npm run deploy:production"],
  ])("%s: install, migrate, then the guarded deploy script", (name, dbSecret, deploy) => {
    const steps = job(name);
    const order = ["run: npm ci", "run: npm run db:migrate", `run: ${deploy}`].map((s) => steps.indexOf(s));
    expect(order.every((p) => p >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(steps).toContain(`DATABASE_URL: \${{ secrets.${dbSecret} }}`);
    expect(steps).toContain("CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}");
    expect(steps).toContain("CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}");
  });

  test("after deploying, each job checks /healthz when the site URL variable is set (S-020)", () => {
    expect(job("staging")).toContain('curl -fsS "$STAGING_URL/healthz"');
    expect(job("production")).toContain('curl -fsS "$PRODUCTION_URL/healthz"');
  });

  test("each deploy job waits for its preflight and runs only when keys are configured", () => {
    for (const name of ["staging", "production"]) {
      expect(job(name)).toMatch(new RegExp(`needs:\\s*${name}-preflight`));
      expect(job(name)).toContain(`needs.${name}-preflight.outputs.configured == 'true'`);
    }
  });

  test("secrets appear only as secrets.NAME, never as literal values", () => {
    expect(workflow).not.toMatch(/(postgres(ql)?:\/\/|re_[A-Za-z0-9]{8,}|eyJ[A-Za-z0-9_-]{10,})/);
    expect([...workflow.matchAll(/secrets\.([A-Z_]+)/g)].map((m) => m[1]).sort()).toEqual(
      expect.arrayContaining(["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN", "PRODUCTION_DATABASE_URL", "STAGING_DATABASE_URL"]),
    );
  });

  test("never lets a failing step pass", () => {
    expect(workflow).not.toMatch(/continue-on-error:\s*true/);
    expect(workflow).not.toMatch(/\|\|\s*true/);
  });
});

describe("scripts/check-keys.sh (skip cleanly until the keys exist)", () => {
  const script = fileURLToPath(new URL("../../scripts/check-keys.sh", import.meta.url));
  const run = (env: Record<string, string>) => {
    const output = join(mkdtempSync(join(tmpdir(), "deploy-keys-")), "github-output");
    writeFileSync(output, "");
    const result = spawnSync("bash", [script, "CLOUDFLARE_API_TOKEN", "STAGING_DATABASE_URL"], {
      // Cast: worker typegen adds required keys to ProcessEnv; the script needs only these.
      env: { PATH: process.env.PATH ?? "", GITHUB_OUTPUT: output, ...env } as unknown as NodeJS.ProcessEnv,
      encoding: "utf8",
    });
    return { status: result.status, out: result.stdout + result.stderr + readFileSync(output, "utf8") };
  };

  test("no key configured: succeeds with a notice and configured=false", () => {
    const { status, out } = run({});
    expect(status).toBe(0);
    expect(out).toContain("configured=false");
    expect(out).toMatch(/::notice::.*not configured yet.*deploy-keys\.md/);
  });

  test("some keys configured: fails naming the missing ones, never printing values", () => {
    const { status, out } = run({ CLOUDFLARE_API_TOKEN: "tok-value-123" });
    expect(status).toBe(1);
    expect(out).toMatch(/::error::.*STAGING_DATABASE_URL/);
    expect(out).not.toContain("tok-value-123");
  });

  test("every key configured: configured=true", () => {
    const { status, out } = run({ CLOUDFLARE_API_TOKEN: "x", STAGING_DATABASE_URL: "y" });
    expect(status).toBe(0);
    expect(out).toContain("configured=true");
  });
});
