// Core secrets vs optional integrations, and launch readiness by name (ADR-0002 amendment).
import { describe, expect, test } from "vitest";
import { ENV_KEYS } from "~/server/env.server";
import {
  CORE_SECRETS,
  INTEGRATION_KEYS,
  integrationConfigured,
  launchReadiness,
  missingKeys,
  parseSecretList,
  readinessAnnotations,
} from "./integrations";

const ALL = [...CORE_SECRETS, ...INTEGRATION_KEYS];

describe("the key lists", () => {
  test("core is exactly the four the site needs to start", () => {
    expect([...CORE_SECRETS]).toEqual(["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "DATABASE_URL"]);
  });

  test("core + integrations cover every Worker secret, with no overlap", () => {
    const workerSecrets = ENV_KEYS.filter((key) => key !== "APP_ENV" && key !== "APP_TIME_ZONE");
    expect([...ALL].sort()).toEqual([...workerSecrets].sort());
    expect(new Set(ALL).size).toBe(ALL.length);
  });
});

describe("integrationConfigured / missingKeys", () => {
  test("an integration is usable only when all its keys are set and non-empty", () => {
    expect(integrationConfigured({ RESEND_API_KEY: "k", EMAIL_FROM: "a <a@example.com>" }, "email")).toBe(true);
    expect(integrationConfigured({ RESEND_API_KEY: "k" }, "email")).toBe(false);
    expect(missingKeys({ RESEND_API_KEY: "", EMAIL_FROM: "x" }, "email")).toEqual(["RESEND_API_KEY"]);
    expect(missingKeys({}, "sentry")).toEqual(["SENTRY_DSN"]);
  });
});

describe("launchReadiness", () => {
  test("everything set: launch ready, nothing missing", () => {
    expect(launchReadiness(ALL)).toEqual({ missingCore: [], missing: [], launchReady: true });
  });

  test("core only (first deploy): starts, but email and Turnstile block the public launch", () => {
    const report = launchReadiness(CORE_SECRETS);

    expect(report.missingCore).toEqual([]);
    expect(report.missing.map((i) => i.name)).toEqual(["email", "push", "authEmailHook", "turnstile", "sentry"]);
    expect(report.missing.filter((i) => i.launchBlocker).map((i) => i.name)).toEqual(["email", "turnstile"]);
    expect(report.launchReady).toBe(false);
  });

  test("optional extras missing only (push, hook, Sentry) do not block the launch", () => {
    const report = launchReadiness([...CORE_SECRETS, "RESEND_API_KEY", "EMAIL_FROM", "TURNSTILE_SECRET_KEY"]);

    expect(report.launchReady).toBe(true);
    expect(report.missing.map((i) => i.name)).toEqual(["push", "authEmailHook", "sentry"]);
  });

  test("a missing core secret is reported and blocks", () => {
    const report = launchReadiness(ALL.filter((key) => key !== "DATABASE_URL"));

    expect(report.missingCore).toEqual(["DATABASE_URL"]);
    expect(report.launchReady).toBe(false);
  });
});

describe("parseSecretList (wrangler secret list --format json)", () => {
  test("reads names, ignoring wrangler's banner lines", () => {
    const stdout = `▲ [WARNING] Proxy environment variables detected.\n[{"name":"DATABASE_URL","type":"secret_text"},{"name":"SUPABASE_URL","type":"secret_text"}]\n`;
    expect(parseSecretList(stdout)).toEqual(["DATABASE_URL", "SUPABASE_URL"]);
  });

  test("an empty Worker has no secrets", () => {
    expect(parseSecretList("[]")).toEqual([]);
  });

  test("anything else is an error", () => {
    expect(() => parseSecretList("Authentication error")).toThrow(/no JSON list/);
  });
});

describe("readinessAnnotations (names only)", () => {
  test("production with core only warns about each integration and that it is not launch ready", () => {
    const lines = readinessAnnotations(launchReadiness(CORE_SECRETS), "production");

    expect(lines.filter((l) => l.startsWith("::warning::"))).toHaveLength(6);
    expect(lines.at(-1)).toBe("::warning::production is NOT ready for public launch: set RESEND_API_KEY, EMAIL_FROM, TURNSTILE_SECRET_KEY first.");
    expect(lines.join("\n")).toContain("email not configured (RESEND_API_KEY, EMAIL_FROM): order emails stay queued in the outbox");
  });

  test("staging only notes missing integrations, but warns about missing core secrets", () => {
    const lines = readinessAnnotations(launchReadiness(["SUPABASE_URL"]), "staging");

    expect(lines[0]).toMatch(/^::warning::staging: missing core secrets SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL/);
    expect(lines.slice(1).every((l) => l.startsWith("::notice::"))).toBe(true);
  });

  test("all set: one plain line", () => {
    expect(readinessAnnotations(launchReadiness(ALL), "production")).toEqual(["production: all core secrets and integrations are configured."]);
  });
});
