import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

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
