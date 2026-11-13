// S-045 AC6: photo files a delete could not remove are retried by the hourly job.
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { requestUploadUrls } from "~/server/services/custom-request.server";
import { requestContext, submitTestRequest } from "~/server/testing/custom-requests";
import { MemoryRequestPhotos } from "~/server/testing/request-photos";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import type { Database } from "~/server/db.server";
import type { StorageGateway } from "~/server/storage.server";
import { purgeStorage } from "./purge-storage";
import { withVariantPaths } from "~/domain/upload";

let database: TestDatabase;

beforeEach(async () => {
  database = await createTestDatabase();
  // Queued before the tick (due_at, 0016): a product photo is due as soon as it is queued.
  await database.client.query("insert into storage_purge (bucket, path, due_at) values ('public-images', 'p/a.webp', '2026-11-01'), ('public-images', 'p/b.webp', '2026-11-01')");
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

  // Each queued original takes its smaller copies with it (S-276 AC7).
  expect(removed).toEqual([withVariantPaths(["p/a.webp", "p/b.webp"])]);
  expect(removed[0]).toContain("p/a-480w.webp");
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

describe("abandoned request photos (E-08 S-153 AC7)", () => {
  beforeEach(async () => {
    await database.client.query("delete from storage_purge");
  });

  test("an upload never sent with a request is removed once 24 h have passed, not before", async () => {
    const photos = new MemoryRequestPhotos();
    const session = randomUUID();
    const issued = await requestUploadUrls({ uploadSessionId: session, files: [{ type: "image/webp", size: 10 }] }, requestContext(database, { photos: photos.gateway, now: "2026-11-11T09:00:00Z" }));
    const path = (issued as { uploads: { path: string }[] }).uploads[0]!.path;
    const removed: string[] = [];
    const storage: StorageGateway = { remove: async (_bucket, paths) => void removed.push(...paths) };

    expect(await purgeStorage({ ...context(), now: new Date("2026-11-12T08:59:00Z") }, storage)).toMatchObject({ processed: 0 });
    expect(await purgeStorage({ ...context(), now: new Date("2026-11-12T09:00:00Z") }, storage)).toMatchObject({ processed: 1 });
    expect(removed).toEqual([path]);
  });

  test("a photo an order holds is never removed, even if a queue row was left behind", async () => {
    const photos = new MemoryRequestPhotos();
    const session = randomUUID();
    const issued = await requestUploadUrls({ uploadSessionId: session, files: [{ type: "image/webp", size: 10 }] }, requestContext(database, { photos: photos.gateway }));
    const path = (issued as { uploads: { path: string }[] }).uploads[0]!.path;
    photos.put(path);
    await submitTestRequest(database, { uploadSessionId: session, photoPaths: [path] }, { photos: photos.gateway });
    await database.client.query("insert into storage_purge (bucket, path, due_at) values ('request-photos', $1, '2026-11-01')", [path]);
    const removed: string[] = [];

    await purgeStorage({ ...context(), now: new Date("2026-12-01T00:00:00Z") }, { remove: async (_b, paths) => void removed.push(...paths) });

    expect(removed).toEqual([]);
    expect(await queue()).toEqual([]);
  });
});
