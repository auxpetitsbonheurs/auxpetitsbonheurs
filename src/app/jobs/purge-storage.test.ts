// S-045 AC6: photo files a delete could not remove are retried by the hourly job.
import { afterEach, beforeEach, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import type { Database } from "~/server/db.server";
import type { StorageGateway } from "~/server/storage.server";
import { purgeStorage } from "./purge-storage";

let database: TestDatabase;

beforeEach(async () => {
  database = await createTestDatabase();
  await database.client.query("insert into storage_purge (bucket, path) values ('public-images', 'p/a.webp'), ('public-images', 'p/b.webp')");
}, 60_000);

afterEach(async () => {
  await database.close();
});

const context = () => ({ now: new Date("2026-11-12T08:00:00Z"), db: database.db as unknown as Database, supabase: { url: "https://ref.supabase.co", anonKey: "anon" } });
const queue = async () => (await database.client.query("select path, attempts from storage_purge order by path")).rows;

test("removes queued objects and empties the queue", async () => {
  const removed: string[][] = [];
  const storage: StorageGateway = { remove: async (_bucket, paths) => void removed.push([...paths]) };

  expect(await purgeStorage(context(), storage)).toEqual({ job: "purgeStorage", ran: true, processed: 2 });

  expect(removed).toEqual([["p/a.webp", "p/b.webp"]]);
  expect(await queue()).toEqual([]);
});

test("a failure keeps them queued and counts an attempt", async () => {
  const storage: StorageGateway = { remove: async () => Promise.reject(new Error("storage remove answered 503")) };

  expect(await purgeStorage(context(), storage)).toEqual({ job: "purgeStorage", ran: true, processed: 0 });

  expect(await queue()).toEqual([
    { path: "p/a.webp", attempts: 1 },
    { path: "p/b.webp", attempts: 1 },
  ]);
});

test("without a Storage key it reports the gap and keeps the queue", async () => {
  expect(await purgeStorage(context())).toEqual({ job: "purgeStorage", ran: false, error: "no Storage key configured" });
  expect(await queue()).toHaveLength(2);
});
