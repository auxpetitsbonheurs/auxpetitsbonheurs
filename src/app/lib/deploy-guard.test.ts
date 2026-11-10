// Deploy guard (tech debt from S-003/S-005 reviews, S-002): a deploy must ship the build made
// for its target, never the lax top-level/development or e2e configuration.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { deployProblems, parseDeployTarget, readJsonc } from "./deploy-guard";

const built = (overrides: Record<string, unknown> = {}) => ({
  name: "auxpetitsbonheurs-staging",
  targetEnvironment: "staging",
  vars: { APP_ENV: "staging", APP_TIME_ZONE: "Indian/Mauritius" },
  ...overrides,
});

describe("parseDeployTarget", () => {
  test("accepts staging and production only", () => {
    expect(parseDeployTarget("staging")).toBe("staging");
    expect(parseDeployTarget("production")).toBe("production");
    for (const bad of [undefined, "", "e2e", "development", "prod"]) {
      expect(() => parseDeployTarget(bad)).toThrow(/staging or production/);
    }
  });
});

describe("deployProblems (built Worker config vs deploy target)", () => {
  test("a staging build for staging is fine", () => {
    expect(deployProblems(built(), "staging")).toEqual([]);
  });

  test("a build made without CLOUDFLARE_ENV (top-level, APP_ENV=development) is refused", () => {
    const problems = deployProblems(built({ targetEnvironment: undefined, name: "auxpetitsbonheurs-local", vars: { APP_ENV: "development", APP_TIME_ZONE: "Indian/Mauritius" } }), "production");

    expect(problems.join("\n")).toMatch(/built for the top-level.*CLOUDFLARE_ENV=production/);
    expect(problems.join("\n")).toMatch(/APP_ENV is "development"/);
  });

  test("the e2e build (TEST_CLOCK, local Supabase and database) is refused", () => {
    const problems = deployProblems(
      built({
        targetEnvironment: "e2e",
        vars: { APP_ENV: "development", TEST_CLOCK: "on", SUPABASE_URL: "http://127.0.0.1:54321", DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/apb_e2e" },
      }),
      "staging",
    ).join("\n");

    expect(problems).toMatch(/built for "e2e"/);
    expect(problems).toMatch(/TEST_CLOCK/);
    expect(problems).toMatch(/SUPABASE_URL/);
    expect(problems).toMatch(/DATABASE_URL/);
  });

  test("a staging build cannot go to production", () => {
    expect(deployProblems(built(), "production").join("\n")).toMatch(/built for "staging"/);
  });

  test("secrets never sit in plain vars, and problems name variables, never values", () => {
    const problems = deployProblems(built({ vars: { APP_ENV: "staging", APP_TIME_ZONE: "Indian/Mauritius", RESEND_API_KEY: "re_secret_value" } }), "staging");

    expect(problems.join("\n")).toMatch(/RESEND_API_KEY/);
    expect(problems.join("\n")).not.toContain("re_secret_value");
  });
});

describe("readJsonc", () => {
  test("drops comments but keeps // inside strings", () => {
    expect(readJsonc('{\n // note\n "a": "https://x/y", /* b */ "c": 1\n}')).toEqual({ a: "https://x/y", c: 1 });
  });
});

describe("wrangler.jsonc: only staging and production are deployable", () => {
  const config = readJsonc(readFileSync(fileURLToPath(new URL("../../wrangler.jsonc", import.meta.url)), "utf8")) as {
    name: string;
    workers_dev?: boolean;
    preview_urls?: boolean;
    triggers?: unknown;
    routes?: unknown;
    env: Record<string, { name: string; workers_dev?: boolean; preview_urls?: boolean; triggers?: unknown; routes?: unknown }>;
  };
  const deployedNames = [config.env.staging!.name, config.env.production!.name];

  test.each([
    ["top level", config],
    ["e2e", config.env.e2e!],
  ])("%s has its own Worker name and no URL, route or cron, so a stray deploy serves nothing", (_label, section) => {
    expect(deployedNames).not.toContain(section.name);
    expect(section.workers_dev).toBe(false);
    expect(section.preview_urls).toBe(false);
    expect(section.routes).toBeUndefined();
    expect(section.triggers).toBeUndefined();
  });

  test.each(["staging", "production"])("%s is served on workers.dev", (env) => {
    expect(config.env[env]!.workers_dev).toBe(true);
  });
});

describe("package.json deploy scripts", () => {
  const scripts = (JSON.parse(readFileSync(fileURLToPath(new URL("../../package.json", import.meta.url)), "utf8")) as { scripts: Record<string, string> }).scripts;

  test.each([
    ["deploy:staging", "staging"],
    ["deploy:production", "production"],
  ])("%s builds for its environment and checks the build before wrangler deploy", (name, env) => {
    const script = scripts[name] ?? "";
    const build = script.indexOf(`CLOUDFLARE_ENV=${env} npm run build`);
    const guard = script.indexOf(`node scripts/check-deploy.ts ${env}`);
    const deploy = script.indexOf(`wrangler deploy --env ${env}`);

    expect(build).toBeGreaterThanOrEqual(0);
    expect(guard).toBeGreaterThan(build);
    expect(deploy).toBeGreaterThan(guard);
  });

  test("there is no bare `deploy` script that could ship the top-level build", () => {
    expect(scripts.deploy).toBeUndefined();
  });
});
