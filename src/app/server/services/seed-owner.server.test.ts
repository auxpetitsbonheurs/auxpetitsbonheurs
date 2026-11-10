import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { type OwnerAuthAdmin, type SeedOwnerConnection, runSeedOwner } from "./seed-owner.server";

// Fake values only; they must never appear in any output.
const PASSWORD = "fake-pass-1234567";
const SERVICE_KEY = "fake-service-role-key-xyz";

function env(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    APP_ENV: "staging",
    SUPABASE_URL: "https://project-ref.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    DATABASE_URL: "postgresql://postgres:placeholder@127.0.0.1:5432/postgres",
    OWNER_EMAIL: "Owner@Example.com",
    OWNER_NAME: "Sabera",
    OWNER_PASSWORD: PASSWORD,
    ...overrides,
  };
}

let database: TestDatabase;
let logs: string[];
let createUser: ReturnType<typeof vi.fn<OwnerAuthAdmin["createUser"]>>;
let connect: ReturnType<typeof vi.fn<() => SeedOwnerConnection>>;

/** Fake Supabase Auth Admin API: writes the user into the stubbed auth.users table. */
function fakeAuthAdmin(): OwnerAuthAdmin {
  createUser = vi.fn(async ({ email, emailConfirm }) => {
    const { rows } = await database.client.query<{ id: string }>(
      `insert into auth.users (email, email_confirmed_at) values ($1, case when $2 then now() end) returning id`,
      [email, emailConfirm],
    );
    return { id: rows[0]!.id };
  });
  return { createUser };
}

function run(vars = env(), argv: string[] = []) {
  return runSeedOwner({ env: vars, argv, connect, log: (line) => logs.push(line) });
}

const adminRows = () =>
  database.client.query("select name, email, role, active, locale from admin").then((r) => r.rows);

beforeEach(async () => {
  database = await createTestDatabase();
  logs = [];
  const auth = fakeAuthAdmin();
  connect = vi.fn(() => ({ auth, db: database.db, close: async () => {} }));
}, 60_000);

afterEach(async () => {
  expect(logs.join("\n")).not.toContain(PASSWORD);
  expect(logs.join("\n")).not.toContain(SERVICE_KEY);
  await database.close();
});

describe("seed:owner", () => {
  test("AC1: creates a confirmed auth user and an active English owner row", async () => {
    const code = await run();

    expect(code).toBe(0);
    expect(createUser).toHaveBeenCalledWith({
      email: "owner@example.com",
      password: PASSWORD,
      emailConfirm: true,
      name: "Sabera",
    });
    const { rows } = await database.client.query("select email_confirmed_at from auth.users");
    expect(rows).toHaveLength(1);
    expect((rows[0] as { email_confirmed_at: unknown }).email_confirmed_at).not.toBeNull();
    expect(await adminRows()).toEqual([
      { name: "Sabera", email: "owner@example.com", role: "owner", active: true, locale: "en" },
    ]);
    expect(logs.join("\n")).toMatch(/Owner created/);
  });

  test("AC2: a second run duplicates nothing, changes no password and succeeds", async () => {
    await run();
    logs = [];

    const code = await run(env({ OWNER_PASSWORD: "another-password-99" }));

    expect(code).toBe(0);
    expect(createUser).toHaveBeenCalledTimes(1);
    expect(await adminRows()).toHaveLength(1);
    expect(logs.join("\n")).toContain("Owner already exists");
  });

  test("AC2: an auth user left by an interrupted run is reused, password untouched", async () => {
    await database.client.query(
      `insert into auth.users (email, email_confirmed_at) values ('owner@example.com', now())`,
    );

    const code = await run();

    expect(code).toBe(0);
    expect(createUser).not.toHaveBeenCalled();
    expect(await adminRows()).toHaveLength(1);
  });

  test("AC3: refuses an email that belongs to a customer account", async () => {
    const { rows } = await database.client.query<{ id: string }>(
      `insert into auth.users (email, email_confirmed_at) values ('owner@example.com', now()) returning id`,
    );
    await database.client.query(
      `insert into customer (name, phone, email, auth_user_id) values ('C', '+23050000000', 'owner@example.com', $1)`,
      [rows[0]!.id],
    );

    const code = await run();

    expect(code).not.toBe(0);
    expect(await adminRows()).toEqual([]);
    expect(createUser).not.toHaveBeenCalled();
    expect(logs.join("\n")).toMatch(/either an admin or a customer/);
  });

  test("AC3: refuses an email used by a guest customer record too", async () => {
    await database.client.query(
      `insert into customer (name, phone, email) values ('C', '+23050000000', 'owner@example.com')`,
    );

    expect(await run()).not.toBe(0);
    expect(await adminRows()).toEqual([]);
    expect(createUser).not.toHaveBeenCalled();
  });

  test.each([
    ["OWNER_EMAIL", { OWNER_EMAIL: undefined }],
    ["OWNER_NAME", { OWNER_NAME: "" }],
    ["OWNER_PASSWORD", { OWNER_PASSWORD: undefined }],
    ["OWNER_EMAIL", { OWNER_EMAIL: "not-an-email" }],
    ["OWNER_PASSWORD", { OWNER_PASSWORD: "short-pw1" }],
    ["SUPABASE_SERVICE_ROLE_KEY", { SUPABASE_SERVICE_ROLE_KEY: undefined }],
    ["DATABASE_URL", { DATABASE_URL: "not a url" }],
    ["APP_ENV", { APP_ENV: "prod" }],
  ])("AC4: invalid %s exits non-zero before any network call, naming it", async (name, overrides) => {
    const vars = env(overrides);

    const code = await run(vars);

    expect(code).not.toBe(0);
    expect(connect).not.toHaveBeenCalled();
    expect(logs.join("\n")).toContain(name);
    for (const value of Object.values(overrides)) {
      if (value) expect(logs.join("\n")).not.toContain(value);
    }
  });

  test("AC5: an Auth API error that echoes secrets is logged redacted", async () => {
    createUser.mockRejectedValueOnce(
      new Error(`upstream rejected password ${PASSWORD} with key ${SERVICE_KEY}`),
    );

    const code = await run();

    expect(code).not.toBe(0);
    expect(logs.join("\n")).toMatch(/upstream rejected password \[redacted\]/);
    expect(await adminRows()).toEqual([]);
  });

  test("AC6: production is refused without --confirm-production, before any network call", async () => {
    const code = await run(env({ APP_ENV: "production" }));

    expect(code).not.toBe(0);
    expect(connect).not.toHaveBeenCalled();
    expect(logs.join("\n")).toContain("--confirm-production");
  });

  test("AC6: production proceeds with --confirm-production", async () => {
    const code = await run(env({ APP_ENV: "production" }), ["--confirm-production"]);

    expect(code).toBe(0);
    expect(await adminRows()).toHaveLength(1);
  });
});
