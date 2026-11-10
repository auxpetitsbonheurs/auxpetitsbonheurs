// make-owner (GitHub Actions "make-owner" workflow): turns a confirmed Supabase Auth user,
// created by the Owner in the Supabase dashboard, into the active Owner. Offline on PGlite.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import type { Database } from "~/server/db.server";
import { type MakeOwnerConnection, runMakeOwner } from "./make-owner.server";

// Fake values only, assembled so no literal looks like a real connection string.
const FAKE_PASSWORD = "fake-db-password-123";
const FAKE_HOST = "pooler.example.com";
const DB_URL = ["postgresql:", "", `postgres.ref:${FAKE_PASSWORD}@${FAKE_HOST}:5432`, "postgres"].join("/");

let database: TestDatabase;
let logs: string[];
let connect: ReturnType<typeof vi.fn<() => MakeOwnerConnection>>;

function env(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return { APP_ENV: "staging", DATABASE_URL: DB_URL, OWNER_EMAIL: "Owner@Example.com", OWNER_NAME: "", ...overrides };
}

const run = (vars = env()) => runMakeOwner({ env: vars, connect, log: (line) => logs.push(line) });

async function authUser(email: string, confirmed = true): Promise<string> {
  const { rows } = await database.client.query<{ id: string }>(
    `insert into auth.users (email, email_confirmed_at) values ($1, case when $2 then now() end) returning id`,
    [email, confirmed],
  );
  return rows[0]!.id;
}

const adminRows = () =>
  database.client.query("select id, name, email, role, active, locale from admin").then((r) => r.rows);

beforeEach(async () => {
  database = await createTestDatabase();
  logs = [];
  connect = vi.fn(() => ({ db: database.db as unknown as Database, close: async () => {} }));
}, 60_000);

afterEach(async () => {
  await database.close();
});

describe("make-owner", () => {
  test("a confirmed auth user becomes the active English Owner (email matched case-insensitively)", async () => {
    const id = await authUser("owner@example.com");

    expect(await run()).toBe(0);

    expect(await adminRows()).toEqual([{ id, name: "owner", email: "owner@example.com", role: "owner", active: true, locale: "en" }]);
    expect(logs).toEqual(["Owner created on staging."]);
  });

  test("uses OWNER_NAME when given", async () => {
    await authUser("owner@example.com");

    await run(env({ OWNER_NAME: "  Sabera " }));

    expect((await adminRows())[0]).toMatchObject({ name: "Sabera" });
  });

  test("is idempotent: a second run changes nothing and succeeds", async () => {
    await authUser("owner@example.com");
    await run();

    expect(await run()).toBe(0);

    expect(await adminRows()).toHaveLength(1);
    expect(logs.at(-1)).toBe("Already the active Owner on staging; nothing changed.");
  });

  test("re-activates a deactivated admin row and makes it Owner", async () => {
    const id = await authUser("owner@example.com");
    await database.client.query(
      `insert into admin (id, name, email, role, active, deactivated_at) values ($1, 'Sabera', 'owner@example.com', 'admin', false, now())`,
      [id],
    );

    expect(await run()).toBe(0);

    const { rows } = await database.client.query("select role, active, deactivated_at, name from admin");
    expect(rows).toEqual([{ role: "owner", active: true, deactivated_at: null, name: "Sabera" }]);
    expect(logs).toEqual(["Owner activated on staging."]);
  });

  test("fails clearly when no auth user has this email", async () => {
    expect(await run()).toBe(1);

    expect(logs[0]).toMatch(/No Supabase Auth user with this email.*Authentication → Users → Add user → Create new user.*Auto Confirm/);
    expect(await adminRows()).toEqual([]);
  });

  test("fails clearly when the auth user has not confirmed the email", async () => {
    await authUser("owner@example.com", false);

    expect(await run()).toBe(1);

    expect(logs[0]).toMatch(/not confirmed/);
    expect(await adminRows()).toEqual([]);
  });

  test("refuses an email that belongs to a customer", async () => {
    const id = await authUser("owner@example.com");
    await database.client.query(`insert into customer (name, phone, auth_user_id) values ('C', '+23057000001', $1)`, [id]);

    expect(await run()).toBe(1);

    expect(logs[0]).toMatch(/customer/);
    expect(await adminRows()).toEqual([]);
  });

  test("invalid input is refused by name before connecting", async () => {
    expect(await run(env({ OWNER_EMAIL: "not-an-email", APP_ENV: "prod" }))).toBe(1);

    expect(connect).not.toHaveBeenCalled();
    expect(logs[0]).toBe("make-owner failed: Invalid or missing: APP_ENV, OWNER_EMAIL.");
  });

  test("a database error never prints the database URL", async () => {
    connect.mockImplementation(() => {
      throw new Error(`connect ECONNREFUSED ${DB_URL} (host ${FAKE_HOST})`);
    });

    expect(await run()).toBe(1);

    expect(logs.join("\n")).not.toContain(FAKE_PASSWORD);
    expect(logs.join("\n")).toMatch(/make-owner failed: connect ECONNREFUSED \[redacted\]/);
  });
});
