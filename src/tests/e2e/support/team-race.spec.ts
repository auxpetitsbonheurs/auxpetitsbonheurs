// S-031 AC4 and S-032 AC5 on real Postgres: two Owners acting on each other at the same
// moment, through the real services on two connections; exactly one wins and one active
// Owner remains. The shared e2e database always has the seeded Owner, so this runs in a
// database of its own (`apb_e2e_team_race`, same local server), reset by this spec.
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../../../app/db/schema";
import { DomainError } from "../../../app/domain/errors";
import type { Database } from "../../../app/server/db.server";
import { changeRole } from "../../../app/server/services/change-role.server";
import { deactivateAdmin } from "../../../app/server/services/deactivate-admin.server";
import type { UserAdmin } from "../../../app/server/user-admin.server";
import { E2E_DATABASE_URL, resetDatabase } from "./database";
import { expect, test } from "./fixtures";

const RACE_URL = E2E_DATABASE_URL.replace(/\/apb_e2e$/, "/apb_e2e_team_race");
const users: UserAdmin = { createUser: async () => ({ ok: false, reason: "failed" }), deleteUser: async () => true, setBanned: async () => true };

async function connect() {
  const client = new pg.Client({ connectionString: RACE_URL });
  await client.connect();
  return { client, db: drizzle({ client, schema }) as unknown as Database };
}

async function outcome(run: Promise<unknown>): Promise<string> {
  try {
    await run;
    return "ok";
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
}

/** Two fresh Owners A and B, and nobody else active as Owner. */
async function twoOwners(client: pg.Client): Promise<[string, string]> {
  await client.query("update admin set role = 'admin' where role = 'owner'");
  const ids: string[] = [];
  for (const name of ["Owner A", "Owner B"]) {
    const id = randomUUID();
    await client.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [id, `${id}@e2e.test`]);
    await client.query("insert into admin (id, name, email, role, active, locale) values ($1, $2, $3, 'owner', true, 'en')", [id, name, `${id}@e2e.test`]);
    ids.push(id);
  }
  return [ids[0]!, ids[1]!];
}

test.describe.serial("last Owner under concurrency", () => {
  // Playwright requires an object pattern here, even when no fixtures are used.
  // eslint-disable-next-line no-empty-pattern
  test.beforeAll(async ({}, info) => {
    // Database-only: once is enough, not once per viewport.
    test.skip(info.project.name !== "desktop-1280", "database-only check");
    await resetDatabase(RACE_URL);
  });

  const scenarios = [
    ["S-031 AC4: two Owners changing each other to Admin", (db: Database, actor: string, target: string) => changeRole(db, { actorId: actor, adminId: target, role: "admin" })],
    ["S-032 AC5: two Owners deactivating each other", (db: Database, actor: string, target: string) => deactivateAdmin(db, users, { actorId: actor, adminId: target, now: new Date() })],
  ] as const;

  for (const [title, act] of scenarios) {
    test(`${title}: exactly one succeeds, one active Owner remains`, async () => {
      const [first, second, holder] = await Promise.all([connect(), connect(), connect()]);
      try {
        const [a, b] = await twoOwners(holder.client);
        // Hold the Owner locks so both changes start, queue on the same rows, then race.
        await holder.client.query("begin");
        await holder.client.query("select id from admin where role = 'owner' and active order by id for update");
        const one = outcome(act(first.db, a, b));
        const two = outcome(act(second.db, b, a));
        await expect
          .poll(async () => (await holder.client.query("select count(*)::int as n from pg_stat_activity where wait_event_type = 'Lock' and datname = 'apb_e2e_team_race'")).rows[0].n)
          .toBe(2);
        await holder.client.query("commit");

        const results = (await Promise.all([one, two])).sort();
        expect(results).toEqual(["LAST_OWNER", "ok"]);
        const { rows } = await holder.client.query("select count(*)::int as n from admin where role = 'owner' and active");
        expect(rows[0].n).toBe(1);
      } finally {
        await holder.client.query("rollback").catch(() => undefined);
        await Promise.all([first.client.end(), second.client.end(), holder.client.end()]);
      }
    });
  }
});
