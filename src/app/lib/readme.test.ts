import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { ENV_KEYS } from "~/server/env.server";

// The app README (src/README.md) is the handover document: the repository root
// README is the GitHub profile page.
const readme = readFileSync(fileURLToPath(new URL("../../README.md", import.meta.url)), "utf8");
const headings = [...readme.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1]?.trim());

describe("README ownership documentation (NFR-012)", () => {
  test("has the handover headings from day one", () => {
    expect(headings).toEqual(
      expect.arrayContaining([
        "What this is",
        "Services and accounts",
        "Run locally",
        "Deploy",
        "Secrets",
        "Backups",
      ]),
    );
  });
});

describe("README deploy runbook (S-004)", () => {
  const deploy = readme.slice(readme.indexOf("## Deploy"), readme.indexOf("## Secrets"));

  test("migrations go to staging first, then production, before the deploy that needs them", () => {
    expect(deploy).toContain("npm run db:migrate");
    expect(deploy.indexOf("staging")).toBeLessThan(deploy.indexOf("production"));
    expect(deploy).toMatch(/before the deploy\s+that needs/i);
  });

  test("the launch checklist says to replace the placeholder Juice number", () => {
    expect(deploy).toMatch(/replace (the )?Juice number/i);
  });
});

describe("README secrets runbook (S-010)", () => {
  const secrets = readme.slice(readme.indexOf("## Secrets"), readme.indexOf("## Backups"));

  test("documents seeding the Owner for staging and production as the user's action", () => {
    expect(secrets).toContain("npm run seed:owner");
    expect(secrets).toContain("--confirm-production");
    expect(secrets).toMatch(/staging/);
    expect(secrets).toMatch(/you run/i);
  });
});

const section = (heading: string) => {
  const start = readme.indexOf(`\n## ${heading}\n`);
  const next = readme.indexOf("\n## ", start + 1);
  return start < 0 ? "" : readme.slice(start, next < 0 ? undefined : next);
};
const repoFile = (path: string) => readFileSync(fileURLToPath(new URL(`../../../${path}`, import.meta.url)), "utf8");
/** Every name a workflow reads with `secrets.NAME` (GitHub Actions secrets). */
const workflowSecrets = (file: string) => [...new Set([...repoFile(file).matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]!))];
/** Worker secrets: every deployable variable except the plain vars kept in wrangler.jsonc. */
const workerSecrets = ENV_KEYS.filter((name) => name !== "APP_ENV" && name !== "APP_TIME_ZONE");

describe("README deploy pipeline (S-002 AC2, AC6)", () => {
  const deploy = section("Deploy");

  test("lists the build and deploy commands for both environments and the branch rule", () => {
    expect(deploy).toContain("npm run deploy:staging");
    expect(deploy).toContain("npm run deploy:production");
    expect(deploy).toContain("CLOUDFLARE_ENV=staging npm run build");
    expect(deploy).toContain("CLOUDFLARE_ENV=production npm run build");
    expect(deploy).toMatch(/merge to `main`/i);
    expect(deploy).toMatch(/fast-forward/i);
    expect(deploy).toContain(".github/workflows/deploy.yml");
  });

  test("documents that a failed build leaves the previous version running, and rollback by redeploying the previous commit", () => {
    expect(deploy).toMatch(/previous version keeps running/i);
    expect(deploy).toMatch(/redeploy(ing)? the previous commit/i);
  });
});

describe("README secrets checklist (S-002 AC3)", () => {
  const secrets = section("Secrets");

  test("is a numbered checklist that links the deploy-keys runbook", () => {
    expect(secrets).toMatch(/^1\. /m);
    expect(secrets).toContain("docs/runbooks/deploy-keys.md");
    expect(secrets).toMatch(/wrangler secret put <NAME> --env (staging\|production|<staging\|production>)/);
  });

  test.each(workerSecrets)("names the Worker secret %s", (name) => {
    expect(secrets).toContain(name);
  });

  test.each(workflowSecrets(".github/workflows/deploy.yml"))("names the GitHub Actions secret %s", (name) => {
    expect(secrets).toContain(name);
  });
});

describe("docs/runbooks/deploy-keys.md (every key, where it goes)", () => {
  const runbook = repoFile("docs/runbooks/deploy-keys.md");

  test.each([...workerSecrets, ...workflowSecrets(".github/workflows/deploy.yml")])("lists %s", (name) => {
    expect(runbook).toContain(`\`${name}\``);
  });

  test("says where each kind of key is entered", () => {
    expect(runbook).toMatch(/Settings → Secrets and variables → Actions/);
    expect(runbook).toMatch(/Workers & Pages → .* → Settings → Variables and Secrets/);
    expect(runbook).toMatch(/Site URL/);
    expect(runbook).toMatch(/Redirect URLs/);
    expect(runbook).toMatch(/seed:owner/);
    expect(runbook).toMatch(/Juice/);
  });
});

describe("README accounts table (S-002 AC4)", () => {
  const accounts = section("Services and accounts");

  test("has a row per bakery-owned account with owner email, MFA and recovery codes", () => {
    expect(accounts).toMatch(/\|\s*Owner email\s*\|/);
    expect(accounts).toMatch(/\|\s*MFA on/);
    expect(accounts).toMatch(/Recovery codes/);
    for (const service of ["Cloudflare", "Supabase", "GitHub", "Resend", "Google", "Sentry", "Domain registrar"]) {
      expect(accounts).toMatch(new RegExp(`^\\|\\s*${service}`, "m"));
    }
  });
});

describe("README launch URLs and Supabase redirect allowlist (S-002 AC5)", () => {
  const deploy = section("Deploy");

  test("states both workers.dev URLs and says there is no custom domain at launch", () => {
    expect(deploy).toContain("https://auxpetitsbonheurs-staging.<subdomain>.workers.dev");
    expect(deploy).toContain("https://auxpetitsbonheurs.<subdomain>.workers.dev");
    expect(deploy).toMatch(/no custom domain at launch/i);
  });

  test("gives the exact redirect URL per environment, without wildcards, and when to edit it", () => {
    expect(deploy).toContain("https://auxpetitsbonheurs-staging.<subdomain>.workers.dev/auth/confirm");
    expect(deploy).toContain("https://auxpetitsbonheurs.<subdomain>.workers.dev/auth/confirm");
    expect(deploy).not.toMatch(/workers\.dev\/\*|\*\*/);
    expect(deploy).toMatch(/custom domain.*(edit|change|update).*redirect/i);
  });
});
