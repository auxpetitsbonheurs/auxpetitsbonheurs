import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { CORE_SECRETS, INTEGRATION_KEYS } from "~/lib/integrations";
import { ENV_KEYS, EnvError, parseEnv } from "./env.server";

const SECRET = "s3cr3t-value-never-printed";

/** Complete, valid bindings for a non-development environment. Values are fakes. */
function bindings(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    APP_ENV: "staging",
    APP_TIME_ZONE: "Indian/Mauritius",
    SUPABASE_URL: "https://project-ref.supabase.co",
    SUPABASE_ANON_KEY: SECRET,
    SUPABASE_SERVICE_ROLE_KEY: SECRET,
    DATABASE_URL: `postgresql://postgres.ref:${SECRET}@pooler.example.com:6543/postgres`,
    RESEND_API_KEY: SECRET,
    EMAIL_FROM: "Aux petits bonheurs <orders@example.com>",
    VAPID_PUBLIC_KEY: SECRET,
    VAPID_PRIVATE_KEY: SECRET,
    VAPID_SUBJECT: "mailto:owner@example.com",
    SUPABASE_AUTH_HOOK_SECRET: SECRET,
    TURNSTILE_SECRET_KEY: SECRET,
    SENTRY_DSN: "https://key@o0.ingest.sentry.io/0",
    ...overrides,
  };
}

function errorOf(run: () => unknown): EnvError {
  try {
    run();
  } catch (error) {
    if (error instanceof EnvError) return error;
    throw error;
  }
  throw new Error("expected parseEnv to throw");
}

describe("parseEnv (AC1: fail loudly, never leak values)", () => {
  test("returns typed settings for valid bindings", () => {
    const env = parseEnv(bindings());

    expect(env.APP_ENV).toBe("staging");
    expect(env.DATABASE_URL).toContain("pooler.example.com");
  });

  test("a missing variable throws an error that names it", () => {
    const error = errorOf(() => parseEnv(bindings({ DATABASE_URL: undefined })));

    expect(error.message).toContain("DATABASE_URL");
    expect(error.variables).toEqual(["DATABASE_URL"]);
  });

  test("a malformed variable is named but its value is never printed", () => {
    const error = errorOf(() => parseEnv(bindings({ SUPABASE_URL: `not-a-url-${SECRET}` })));

    expect(error.message).toContain("SUPABASE_URL");
    expect(error.message).not.toContain(SECRET);
    expect(JSON.stringify(error)).not.toContain(SECRET);
    expect(String(error.stack)).not.toContain(SECRET);
    expect(error.cause).toBeUndefined();
  });

  test("several problems are reported together, by name only", () => {
    const error = errorOf(() =>
      parseEnv(bindings({ SUPABASE_ANON_KEY: "", DATABASE_URL: `mysql://${SECRET}` })),
    );

    expect(error.variables).toEqual(["SUPABASE_ANON_KEY", "DATABASE_URL"]);
    expect(error.message).not.toContain(SECRET);
  });

  test.each(["staging", "production"])("%s starts with only the four core secrets (ADR-0002 amendment)", (APP_ENV) => {
    const optional = Object.fromEntries(INTEGRATION_KEYS.map((key) => [key, undefined]));

    const env = parseEnv(bindings({ APP_ENV, ...optional }));

    expect(env.APP_ENV).toBe(APP_ENV);
    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.TURNSTILE_SECRET_KEY).toBeUndefined();
  });

  test.each(CORE_SECRETS)("a deployed Worker still refuses to start without core secret %s", (key) => {
    const error = errorOf(() => parseEnv(bindings({ APP_ENV: "production", [key]: undefined })));

    expect(error.variables).toEqual([key]);
  });

  test("an integration secret that is set but malformed is still refused, by name", () => {
    const error = errorOf(() => parseEnv(bindings({ SENTRY_DSN: `not-a-dsn-${SECRET}` })));

    expect(error.variables).toEqual(["SENTRY_DSN"]);
    expect(error.message).not.toContain(SECRET);
  });

  test("integration secrets may be absent in development", () => {
    const env = parseEnv(
      bindings({ APP_ENV: "development", RESEND_API_KEY: undefined, SENTRY_DSN: undefined }),
    );

    expect(env.RESEND_API_KEY).toBeUndefined();
  });
});

describe("parseEnv (AC3: time zone and environment are fixed sets)", () => {
  test.each(["UTC", "Asia/Dubai", "indian/mauritius", ""])("refuses APP_TIME_ZONE %j", (zone) => {
    const error = errorOf(() => parseEnv(bindings({ APP_TIME_ZONE: zone })));

    expect(error.variables).toEqual(["APP_TIME_ZONE"]);
  });

  test.each(["development", "staging", "production"])("accepts APP_ENV %s", (appEnv) => {
    expect(parseEnv(bindings({ APP_ENV: appEnv })).APP_ENV).toBe(appEnv);
  });

  test.each(["test", "prod", "Production", undefined])("refuses APP_ENV %j", (appEnv) => {
    const error = errorOf(() => parseEnv(bindings({ APP_ENV: appEnv })));

    expect(error.variables).toEqual(["APP_ENV"]);
  });
});

describe("parseEnv (S-005 AC6: the test clock is development-only)", () => {
  test("development may enable TEST_CLOCK", () => {
    const env = parseEnv(
      bindings({ APP_ENV: "development", TEST_CLOCK: "on", DATABASE_URL: "postgresql://postgres:pw@127.0.0.1:5432/apb_e2e" }),
    );

    expect(env.TEST_CLOCK).toBe("on");
  });

  test.each(["staging", "production"])("%s refuses to start with TEST_CLOCK set", (appEnv) => {
    const error = errorOf(() => parseEnv(bindings({ APP_ENV: appEnv, TEST_CLOCK: "on" })));

    expect(error.variables).toEqual(["TEST_CLOCK"]);
  });

  test("with TEST_CLOCK on, DATABASE_URL must be a local database", () => {
    const error = errorOf(() => parseEnv(bindings({ APP_ENV: "development", TEST_CLOCK: "on" })));

    expect(error.variables).toEqual(["DATABASE_URL"]);
  });

  test("TEST_CLOCK accepts only the value on", () => {
    const error = errorOf(() => parseEnv(bindings({ APP_ENV: "development", TEST_CLOCK: "yes" })));

    expect(error.variables).toEqual(["TEST_CLOCK"]);
  });
});

describe("parseEnv (deploy guard: no local Supabase outside development)", () => {
  test.each(["staging", "production"])("%s refuses a non-https SUPABASE_URL", (APP_ENV) => {
    const error = errorOf(() => parseEnv(bindings({ APP_ENV, SUPABASE_URL: "http://127.0.0.1:54321" })));

    expect(error.variables).toEqual(["SUPABASE_URL"]);
  });

  test("development may use the local Supabase CLI over http", () => {
    expect(parseEnv(bindings({ APP_ENV: "development", SUPABASE_URL: "http://127.0.0.1:54321" })).SUPABASE_URL).toBe("http://127.0.0.1:54321");
  });
});

describe(".dev.vars.example (AC2)", () => {
  const example = readFileSync(
    fileURLToPath(new URL("../../.dev.vars.example", import.meta.url)),
    "utf8",
  );
  const entries = new Map(
    example
      .split("\n")
      .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line))
      .map((line) => {
        const at = line.indexOf("=");
        return [line.slice(0, at), line.slice(at + 1)] as const;
      }),
  );
  const nonSecret = new Set(["APP_ENV", "APP_TIME_ZONE"]);

  test("lists every variable the schema reads", () => {
    expect([...entries.keys()].sort()).toEqual([...ENV_KEYS].sort());
  });

  test("holds placeholders only", () => {
    const real = [...entries]
      .filter(([key]) => !nonSecret.has(key))
      .filter(([, value]) => !/replace|example|your-project/i.test(value))
      .map(([key]) => key);

    expect(real).toEqual([]);
  });
});
