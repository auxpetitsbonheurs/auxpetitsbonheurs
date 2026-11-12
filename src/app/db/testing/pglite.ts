// In-process Postgres for tests (PGlite): no Docker, no network, deterministic.
// Stubs the Supabase-owned objects our migrations reference (auth.users,
// storage.buckets, the anon/authenticated roles), then applies every migration
// in ./drizzle exactly as `npm run db:migrate` would. Never point this at a real database.
//
// Speed (CI took 31 min when every test ran initdb + migrations, ~2 s each):
// - the migrated database is built ONCE per run (vitest global setup, ./pglite-global-setup.ts)
//   and dumped; each test file loads that dump (~0.4 s) instead of running initdb;
// - inside a file, the next test reuses the file's instance after `reset()` puts it back
//   exactly as migrated: every table emptied and refilled from the template's rows,
//   every sequence put back, session state discarded. A test that ran DDL (a failing
//   trigger, a table) marks the instance dirty and the next test gets a fresh load instead.
// Each test therefore still starts from the same freshly migrated database it always did.
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { inject } from "vitest";
import * as schema from "~/db/schema";
import { SUPABASE_GRANTS, SUPABASE_STUBS } from "./supabase-stubs";

declare module "vitest" {
  export interface ProvidedContext {
    /** The migrated template's data directory (tar), written by ./pglite-global-setup.ts. */
    pgliteTemplatePath: string;
  }
}

export const migrationsFolder = fileURLToPath(new URL("../../../drizzle", import.meta.url));

/** Holds the template's rows, the reset function and the DDL marker; never touched by app code. */
const KIT = "_test_template";

/**
 * Snapshots every table's rows and every sequence of the freshly migrated database, and
 * creates `${KIT}.reset()` that restores them. The event trigger records any DDL a test
 * runs, so an instance whose schema changed is never reused.
 */
const SNAPSHOT_SQL = `
create schema ${KIT};
do $snapshot$
declare
  t record;
  s record;
  cols text;
  has_rows boolean;
  sequences text := '';
  restore text := '';
  clear text := '';
begin
  for t in
    select c.oid, n.nspname, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p') and n.nspname not in ('pg_catalog', 'information_schema', '${KIT}')
      and n.nspname not like 'pg_toast%' and n.nspname not like 'pg_temp%'
    order by n.nspname, c.relname
  loop
    clear := clear || format('delete from %I.%I;', t.nspname, t.relname);
    select string_agg(format('%I', a.attname), ', ' order by a.attnum) into cols
      from pg_attribute a where a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped and a.attgenerated = '';
    execute format('create table ${KIT}.%I as select %s from %I.%I', t.nspname || '.' || t.relname, cols, t.nspname, t.relname);
    execute format('select exists (select from ${KIT}.%I)', t.nspname || '.' || t.relname) into has_rows;
    if has_rows then
      restore := restore || format(
        'insert into %I.%I (%s) overriding system value select %s from ${KIT}.%I;',
        t.nspname, t.relname, cols, cols, t.nspname || '.' || t.relname);
    end if;
  end loop;
  for s in
    select n.nspname, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'S' and n.nspname <> '${KIT}'
  loop
    execute format('select format(''perform setval(%%L, %%s, %%s);'', %L, last_value, is_called::text) from %I.%I',
      format('%I.%I', s.nspname, s.relname), s.nspname, s.relname) into cols;
    sequences := sequences || cols;
  end loop;
  execute format($fn$
    create function ${KIT}.reset() returns boolean language plpgsql as $reset$
    begin
      if exists (select from ${KIT}.ddl_seen) then return false; end if;
      perform set_config('session_replication_role', 'replica', true);
      %s
      %s
      %s
      perform set_config('session_replication_role', 'origin', true);
      return true;
    end $reset$
  $fn$, clear, restore, sequences);
end $snapshot$;
create table ${KIT}.ddl_seen (tag text);
create function ${KIT}.note_ddl() returns event_trigger language plpgsql as $$
begin
  insert into ${KIT}.ddl_seen values (tg_tag);
end $$;
create event trigger ${KIT}_ddl on ddl_command_end execute function ${KIT}.note_ddl();
`;

async function migrateFresh(): Promise<PGlite> {
  const client = new PGlite();
  await client.exec(SUPABASE_STUBS);
  await migrate(drizzle({ client, schema }), { migrationsFolder });
  await client.exec(SUPABASE_GRANTS);
  return client;
}

/** The migrated database plus the reset kit, as a data-directory tarball (global setup). */
export async function buildTemplateDataDir(): Promise<Blob> {
  const client = await migrateFresh();
  await client.exec(SNAPSHOT_SQL);
  const dump = await client.dumpDataDir("none");
  await client.close();
  return dump;
}

let template: Promise<Blob> | undefined;

function templateDataDir(): Promise<Blob> {
  template ??= (async () => {
    // Written by the global setup; without it (a lone file run some other way), build it here.
    const path: string | undefined = inject("pgliteTemplatePath");
    return path ? new Blob([await readFile(path)]) : buildTemplateDataDir();
  })();
  return template;
}

type Instance = { client: PGlite; inUse: boolean };
let shared: Instance | undefined;

async function loadInstance(): Promise<Instance> {
  const client = new PGlite({ loadDataDir: await templateDataDir() });
  await client.waitReady;
  return { client, inUse: false };
}

/** Puts the instance back to the migrated state; false when a test changed its schema. */
async function reset({ client }: Instance): Promise<boolean> {
  const restore = (async () => {
    await client.exec("rollback");
    await client.exec("discard all");
    const [row] = (await client.query<{ ok: boolean }>(`select ${KIT}.reset() as ok`)).rows;
    return row?.ok === true;
  })();
  // A test that left work queued on the instance must not stall the next one: load afresh.
  const stalled = new Promise<boolean>((resolve) => setTimeout(resolve, 5_000, false).unref());
  return Promise.race([restore.catch(() => false), stalled]);
}

async function acquireShared(): Promise<Instance> {
  if (shared && !shared.client.closed && (await reset(shared))) return shared;
  if (shared) void shared.client.close().catch(() => undefined);
  shared = await loadInstance();
  return shared;
}

/**
 * PGlite's prototype chain with every method bound to `client`: it keeps private fields, so
 * its methods (and a spy wrapping one, which finds the original here) must run on it.
 */
function boundPrototype(client: PGlite): object {
  const first = Object.getPrototypeOf(client) as object;
  const bound = Object.create(first) as object;
  for (let proto: object | null = first; proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto) as object | null) {
    for (const key of Reflect.ownKeys(proto)) {
      const { value } = Reflect.getOwnPropertyDescriptor(proto, key)!;
      if (key === "constructor" || typeof value !== "function" || Object.hasOwn(bound, key)) continue;
      Object.defineProperty(bound, key, { value: (value as () => unknown).bind(client), configurable: true, writable: true });
    }
  }
  return bound;
}

/**
 * What a test sees as `client`: the instance, through a proxy of its own. A spy or stub a
 * test puts on it (vi.spyOn(database.client, "query")) dies with the test, and after
 * `close()` every method fails as on a closed PGlite (the "database down" tests).
 */
function testView(client: PGlite): { view: PGlite; close: () => void } {
  const own = new Map<PropertyKey, PropertyDescriptor>();
  const methods = boundPrototype(client);
  let closed = false;
  const view: PGlite = new Proxy(client, {
    get(target, prop) {
      if (prop === "closed") return closed || target.closed;
      const descriptor = own.get(prop);
      if (descriptor) return descriptor.get ? descriptor.get.call(target) : descriptor.value;
      const value: unknown = Reflect.get(target, prop, target);
      if (typeof value !== "function" || prop === "constructor") return value;
      if (closed) return () => Promise.reject(new Error("PGlite is closed"));
      if (Object.hasOwn(target, prop)) return (value as () => unknown).bind(target);
      return (Reflect.get(methods, prop) as unknown) ?? (value as () => unknown).bind(target);
    },
    getPrototypeOf: () => methods,
    // A test's assignment (client.query = counting) stays on its view, like a spy.
    set(_target, prop, value) {
      own.set(prop, { configurable: true, enumerable: true, writable: true, value });
      return true;
    },
    defineProperty(_target, prop, descriptor) {
      own.set(prop, { configurable: true, enumerable: true, ...descriptor });
      return true;
    },
    deleteProperty(target, prop) {
      return own.delete(prop) || Reflect.deleteProperty(target, prop);
    },
    getOwnPropertyDescriptor(target, prop) {
      return own.get(prop) ?? Reflect.getOwnPropertyDescriptor(target, prop);
    },
    has: (target, prop) => own.has(prop) || Reflect.has(target, prop),
  });
  return { view, close: () => void (closed = true) };
}

export async function createTestDatabase() {
  // One database at a time is the norm; a second, concurrent one gets its own instance.
  const owned = shared?.inUse ? await loadInstance() : undefined;
  const instance = owned ?? (await acquireShared());
  instance.inUse = true;
  const { view, close } = testView(instance.client);
  return {
    client: view,
    db: drizzle({ client: view, schema }),
    close: async () => {
      close();
      if (owned) await owned.client.close();
      else instance.inUse = false;
    },
  };
}

/** Closes the file's shared instance (vitest-setup, after each file). */
export async function closeSharedTestDatabase() {
  const instance = shared;
  shared = undefined;
  if (instance && !instance.client.closed) await instance.client.close();
}

export type TestDatabase = Awaited<ReturnType<typeof createTestDatabase>>;
