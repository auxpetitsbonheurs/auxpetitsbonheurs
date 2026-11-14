// Deploy guard (tech debt from S-003/S-005 reviews, S-002): a deploy must ship the build made
// for its target, never the lax top-level/development or e2e configuration.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { deployProblems, describeHyperdriveConfig, hyperdriveBinding, parseDeployTarget, readJsonc } from "./deploy-guard";

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

  test("the sender address and site URL may be plain vars (not secrets; deploys replace dashboard text vars)", () => {
    const vars = { APP_ENV: "staging", APP_TIME_ZONE: "Indian/Mauritius", EMAIL_FROM: "Bakery <orders@mail.example.com>", SITE_URL: "https://staging.example.com" };
    expect(deployProblems(built({ vars }), "staging").join("\n")).not.toMatch(/EMAIL_FROM|SITE_URL/);
  });
});

describe("hyperdriveBinding (ADR-0003)", () => {
  const ID = "0123456789abcdef0123456789abcdef";

  test("an empty or missing id adds nothing and says to skip", () => {
    for (const empty of [undefined, "", "  "]) expect(hyperdriveBinding(empty)).toEqual({ skip: true });
  });

  test("a valid id yields the HYPERDRIVE binding", () => {
    expect(hyperdriveBinding(` ${ID}\n`)).toEqual({ skip: false, binding: { binding: "HYPERDRIVE", id: ID } });
  });

  test("a malformed id is an error that does not echo the value", () => {
    expect(() => hyperdriveBinding("postgresql://user:pw@host/db")).toThrow(/Hyperdrive/);
    expect(() => hyperdriveBinding("postgresql://user:pw@host/db")).not.toThrow(/pw@host/);
  });

  test("a build carrying the binding still passes the deploy guard", () => {
    expect(deployProblems(built({ hyperdrive: [{ binding: "HYPERDRIVE", id: ID }] }), "staging")).toEqual([]);
  });
});

describe("describeHyperdriveConfig (ADR-0003 amendment 3)", () => {
  const config = (host: string, port: number, caching?: { disabled: boolean }) => ({
    id: "x",
    origin: { host, port, database: "postgres", user: "postgres.abcdef", scheme: "postgres" },
    ...(caching ? { caching } : {}),
  });

  test("the direct connection with caching off needs nothing", () => {
    expect(describeHyperdriveConfig(config("db.abcdefghij.supabase.co", 5432, { disabled: true }))).toEqual({ origin: "Supabase direct", port: 5432, caching: "off", warnings: [] });
  });

  test("the session pooler is fine; caching on (also the API default) asks the Owner to turn it off", () => {
    const report = describeHyperdriveConfig(config("aws-0-ap-south-1.pooler.supabase.com", 5432));
    expect(report).toMatchObject({ origin: "Supabase session pooler", port: 5432, caching: "on" });
    expect(report.warnings).toEqual([expect.stringContaining("Caching: turn it off")]);
  });

  test("the transaction pooler is flagged with where to change it, and nothing identifying is echoed", () => {
    const report = describeHyperdriveConfig(config("aws-0-ap-south-1.pooler.supabase.com", 6543, { disabled: true }));
    expect(report.origin).toBe("Supabase transaction pooler");
    expect(report.warnings[0]).toMatch(/Session pooler \(port 5432\) or Direct/);
    expect(JSON.stringify(report)).not.toMatch(/abcdef|ap-south-1|postgres\./);
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

  test.each([
    ["deploy:staging", "staging"],
    ["deploy:production", "production"],
  ])("%s injects the Hyperdrive binding after the guard and before wrangler deploy", (name, env) => {
    const script = scripts[name] ?? "";
    const guard = script.indexOf(`node scripts/check-deploy.ts ${env}`);
    const inject = script.indexOf(`node scripts/inject-hyperdrive.ts ${env}`);
    const deploy = script.indexOf(`wrangler deploy --env ${env}`);

    expect(inject).toBeGreaterThan(guard);
    expect(deploy).toBeGreaterThan(inject);
  });

  test("wrangler.jsonc declares no hyperdrive binding (the id is injected at deploy time)", () => {
    expect(readFileSync(fileURLToPath(new URL("../../wrangler.jsonc", import.meta.url)), "utf8")).not.toMatch(/"hyperdrive"\s*:/);
  });

  test("there is no bare `deploy` script that could ship the top-level build", () => {
    expect(scripts.deploy).toBeUndefined();
  });
});
