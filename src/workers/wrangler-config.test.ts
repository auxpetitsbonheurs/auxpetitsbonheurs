// S-002 AC1: staging and production are separate Workers with their own APP_ENV and an
// hourly cron each; the file holds no secret and no account id (NFR-012, NFR-009).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { readJsonc } from "~/lib/deploy-guard";
import { ENV_KEYS } from "~/server/env.server";

const source = readFileSync(fileURLToPath(new URL("../wrangler.jsonc", import.meta.url)), "utf8");
type Section = { name: string; vars?: Record<string, string>; triggers?: { crons: string[] } };
const config = readJsonc(source) as Section & { env: Record<string, Section> };
const staging = config.env.staging!;
const production = config.env.production!;

describe("wrangler.jsonc environments (S-002 AC1)", () => {
  test("staging and production have different Worker names and APP_ENV values", () => {
    expect(staging.name).not.toBe(production.name);
    expect(staging.vars?.APP_ENV).toBe("staging");
    expect(production.vars?.APP_ENV).toBe("production");
  });

  test.each([
    ["staging", staging],
    ["production", production],
  ])("%s has one hourly cron trigger", (_name, env) => {
    expect(env.triggers?.crons).toEqual(["0 * * * *"]);
  });

  test("holds no secret and no account id", () => {
    const plainVars = new Set(["APP_ENV", "APP_TIME_ZONE"]);
    for (const env of [staging, production]) {
      const secretsInVars = Object.keys(env.vars ?? {}).filter((name) => ENV_KEYS.includes(name) && !plainVars.has(name));
      expect(secretsInVars).toEqual([]);
    }
    expect(source).not.toMatch(/account_id/);
    expect(source).not.toMatch(/\b[0-9a-f]{32}\b/);
  });
});
