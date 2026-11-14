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
import { REQUEST_PHOTOS_BUCKET } from "~/domain/custom-request";
import { RETENTION } from "~/domain/privacy-facts";

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

describe("photos of closed requests (PRV-03, data-model retention: 90 days after a final status)", () => {
  const DAY = 86_400_000;
  let photos: MemoryRequestPhotos;

  beforeEach(async () => {
    await database.client.query("delete from storage_purge");
    photos = new MemoryRequestPhotos();
  });

  /** A request with one uploaded photo and one gallery photo, moved to `status` at `closedAt`. */
  async function closedRequest(status: string, closedAt: Date): Promise<{ orderId: string; path: string; galleryPath: string }> {
    const session = randomUUID();
    const issued = await requestUploadUrls({ uploadSessionId: session, files: [{ type: "image/webp", size: 10 }] }, requestContext(database, { photos: photos.gateway }));
    const path = (issued as { uploads: { path: string }[] }).uploads[0]!.path;
    photos.put(path);
    const { rows } = await database.client.query<{ id: string; storage_path: string }>(
      "insert into gallery_photo (storage_path, width, height) values ($1, 800, 600) returning id, storage_path",
      [`gallery/${randomUUID()}.webp`],
    );
    const gallery = rows[0]!;
    const placed = await submitTestRequest(database, { uploadSessionId: session, photoPaths: [path], galleryPhotoId: gallery.id }, { photos: photos.gateway });
    await database.client.query("update orders set status = $2, updated_at = $3 where id = $1", [placed.orderId, status, closedAt.toISOString()]);
    await database.client.query("insert into order_event (order_id, actor_type, type, from_status, to_status, created_at) values ($1, 'system', 'status_changed', 'quote_needed', $2, $3)", [placed.orderId, status, closedAt.toISOString()]);
    return { orderId: placed.orderId, path, galleryPath: gallery.storage_path };
  }

  const NOW = new Date("2026-11-12T08:00:00Z");
  const run = (storage: StorageGateway) => purgeStorage({ ...context(), now: NOW }, storage);
  const photoRows = async (orderId: string) => (await database.client.query("select storage_path from custom_request_photo where order_id = $1 order by sort_order", [orderId])).rows;

  test.each(["declined", "closed", "completed", "cancelled"])("a request %s more than 90 days ago loses its uploaded photo; the gallery photo stays", async (status) => {
    const old = await closedRequest(status, new Date(NOW.getTime() - (RETENTION.requestPhotoDays * DAY + 60_000)));
    const removed: { bucket: string; paths: string[] }[] = [];

    await run({ remove: async (bucket, paths) => void removed.push({ bucket, paths: [...paths] }) });

    expect(removed).toEqual([{ bucket: REQUEST_PHOTOS_BUCKET, paths: [old.path] }]);
    expect(await photoRows(old.orderId)).toEqual([{ storage_path: old.galleryPath }]);
    expect(await queue()).toEqual([]);
  });

  test("a request closed less than 90 days ago, or still open, keeps its photos", async () => {
    const recent = await closedRequest("declined", new Date(NOW.getTime() - (RETENTION.requestPhotoDays * DAY - 60_000)));
    const open = await closedRequest("quote_sent", new Date(NOW.getTime() - 400 * DAY));
    const removed: string[] = [];

    await run({ remove: async (_b, paths) => void removed.push(...paths) });

    expect(removed).toEqual([]);
    expect(await photoRows(recent.orderId)).toHaveLength(2);
    expect(await photoRows(open.orderId)).toHaveLength(2);
  });

  test("a Storage failure keeps the path queued for the next tick (nothing is forgotten), and a second run is a no-op once done", async () => {
    const old = await closedRequest("declined", new Date(NOW.getTime() - 200 * DAY));

    await run({ remove: async () => Promise.reject(new Error("503")) });
    expect(await queue()).toEqual([{ path: old.path, attempts: 1 }]);

    const removed: string[] = [];
    await run({ remove: async (_b, paths) => void removed.push(...paths) });
    expect(removed).toEqual([old.path]);
    expect(await run({ remove: async () => Promise.reject(new Error("never called")) })).toEqual({ job: "purgeStorage", ran: true, processed: 0 });
  });
});
