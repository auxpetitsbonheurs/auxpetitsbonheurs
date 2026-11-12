// Threat model G-19: the client-bundle secret check (names and values, reported by name only).
import { describe, expect, test } from "vitest";
import { findClientSecrets, secretValues } from "./client-secrets";

const STAND_IN = "stand-in-value-for-tests";

describe("findClientSecrets", () => {
  test("a clean bundle has no findings, public names are allowed", () => {
    const files = [{ path: "assets/root.js", text: 'const u = env.SUPABASE_URL, k = env.SUPABASE_ANON_KEY, v = "VAPID_PUBLIC_KEY";' }];

    expect(findClientSecrets(files)).toEqual([]);
  });

  test.each(["SUPABASE_SERVICE_ROLE_KEY", "DATABASE_URL", "RESEND_API_KEY", "TURNSTILE_SECRET_KEY", "SOME_WEBHOOK_SECRET", "NEW_PRIVATE_KEY"])("names %s", (name) => {
    expect(findClientSecrets([{ path: "assets/a.js", text: `x.${name}` }])).toEqual([{ file: "assets/a.js", name, kind: "name" }]);
  });

  test("finds a secret's value and reports only its name", () => {
    const findings = findClientSecrets([{ path: "assets/b.js", text: `const k="${STAND_IN}"` }], { SUPABASE_SERVICE_ROLE_KEY: STAND_IN });

    expect(findings).toEqual([{ file: "assets/b.js", name: "SUPABASE_SERVICE_ROLE_KEY", kind: "value" }]);
    expect(JSON.stringify(findings)).not.toContain(STAND_IN);
  });

  test("ignores values too short to be meaningful", () => {
    expect(findClientSecrets([{ path: "a.js", text: "abc" }], { DATABASE_URL: "abc" })).toEqual([]);
  });
});

describe("secretValues", () => {
  test("keeps only secret-named string entries", () => {
    expect(secretValues({ SUPABASE_URL: "https://x", SUPABASE_SERVICE_ROLE_KEY: STAND_IN, MY_SECRET: STAND_IN, APP_ENV: "e2e", N: 1 })).toEqual({
      SUPABASE_SERVICE_ROLE_KEY: STAND_IN,
      MY_SECRET: STAND_IN,
    });
  });
});
