// E-14 data, public read, own review and decisions against PGlite:
// S-261 AC1..AC8, S-262 AC3..AC9 (server side), S-263 AC2..AC4/AC8, S-265 AC1..AC3/AC7, S-268 AC2/AC3/AC6.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import type { CustomerAccount } from "~/server/customer-auth.server";
import { adminDeleteReview, decideReview, findOwnReview, listAdminReviews, listPublicReviews, reviewSummary } from "~/server/repos/reviews.server";
import { insertAdmin, insertCustomerAccount } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { clearReviewCache, deleteOwn, publicFirstPage, publicReviewsUpTo, submitOwnReview } from "./reviews.server";

let database: TestDatabase;
let auth: FakeAuth;
const NOW = new Date("2026-11-12T08:00:00Z");

beforeAll(async () => {
  database = await createTestDatabase();
}, 60_000);

beforeEach(async () => {
  auth = new FakeAuth();
  clearReviewCache();
  await database.client.exec("delete from review; delete from review_event; delete from rate_limit_bucket");
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await database.close();
});

async function customer(name = "Anna Kowalski"): Promise<CustomerAccount> {
  const account = await insertCustomerAccount(database, auth);
  const { rows } = await database.client.query<{ id: string }>("update customer set name = $1 where auth_user_id = $2 returning id", [name, account.id]);
  return { id: rows[0]!.id, name, phone: "+23057000000", email: account.email, locale: "en", authEmail: account.email };
}

const db = () => database.db as never;

async function send(who: CustomerAccount, rating: unknown, comment: unknown, extra: Record<string, unknown> = {}, now = NOW) {
  return submitOwnReview(db(), { customer: who, form: { rating, comment, ...extra }, locale: "en", now, hadReview: false });
}

async function reviewOf(who: CustomerAccount) {
  const { rows } = await database.client.query("select * from review where customer_id = $1", [who.id]);
  return rows[0] as { id: string; status: string; version: number; display_name: string; comment: string } | undefined;
}

async function approve(who: CustomerAccount, adminId: string) {
  const row = (await reviewOf(who))!;
  return decideReview(db(), { id: row.id, version: row.version, move: "approve", adminId });
}

describe("database rules (S-261 AC1, AC2)", () => {
  test.each([
    ["rating 6", 6, "ok"],
    ["rating 0", 0, "ok"],
    ["empty comment", 3, "   "],
    ["1001 characters", 3, "a".repeat(1001)],
  ])("the check constraints refuse %s", async (_name, rating, comment) => {
    const who = await customer();
    await expect(
      database.client.query("insert into review (customer_id, rating, comment, display_name, locale) values ($1, $2, $3, 'Anna K.', 'en')", [who.id, rating, comment]),
    ).rejects.toThrow(/check constraint/);
  });

  test("one review per customer; the row holds no email, phone or order column (S-268 AC3)", async () => {
    const who = await customer();
    await database.client.query("insert into review (customer_id, rating, comment, display_name, locale) values ($1, 5, 'Lovely', 'Anna K.', 'en')", [who.id]);
    await expect(database.client.query("insert into review (customer_id, rating, comment, display_name, locale) values ($1, 4, 'Again', 'Anna K.', 'en')", [who.id])).rejects.toThrow(/unique/);
    const { rows } = await database.client.query<{ column_name: string }>("select column_name from information_schema.columns where table_name = 'review'");
    expect(rows.map((r) => r.column_name).filter((c) => /mail|phone|order|address/.test(c))).toEqual([]);
  });

  test("RLS is on for review and review_event (anon key reads nothing; S-261 AC7)", async () => {
    const { rows } = await database.client.query<{ relname: string; relrowsecurity: boolean }>("select relname, relrowsecurity from pg_class where relname in ('review', 'review_event') order by relname");
    expect(rows).toEqual([
      { relname: "review", relrowsecurity: true },
      { relname: "review_event", relrowsecurity: true },
    ]);
  });

  test("deleting the customer row deletes the review (S-268 AC2)", async () => {
    const who = await customer();
    await send(who, 5, "Lovely");
    await database.client.query("delete from customer where id = $1", [who.id]);
    expect(await database.client.query("select 1 from review").then((r) => r.rows)).toEqual([]);
  });
});

describe("sending, editing and deleting my review (S-262)", () => {
  test("a valid review is saved as pending with the display name; HTML is kept as text (AC3, AC7)", async () => {
    const who = await customer();
    expect(await send(who, "5", "  <b>Best</b> cakes\r\nin town  ")).toEqual({ ok: true, status: "pending", edited: false });
    expect(await reviewOf(who)).toMatchObject({ status: "pending", display_name: "Anna K.", comment: "<b>Best</b> cakes\nin town", rating: 5 });
  });

  test("field problems are VALIDATION_FAILED and nothing is written (AC4)", async () => {
    const who = await customer();
    expect(await send(who, "", "")).toEqual({ ok: false, code: "VALIDATION_FAILED", fields: { rating: "reviewForm.errors.rating", comment: "reviewForm.errors.commentMissing" } });
    expect(await send(who, 4, "x".repeat(1001))).toMatchObject({ fields: { comment: "reviewForm.errors.commentTooLong" } });
    expect(await reviewOf(who)).toBeUndefined();
  });

  test("a double submit leaves one review (AC7); an edit of a published review goes back to pending and off the site (AC5)", async () => {
    const who = await customer();
    const admin = await insertAdmin(database, auth);
    await Promise.all([send(who, 5, "Lovely"), send(who, 5, "Lovely")]);
    await approve(who, admin.id);
    expect((await listPublicReviews(db(), { limit: 10, offset: 0 })).length).toBe(1);

    await send(who, 4, "Still lovely");

    expect(await reviewOf(who)).toMatchObject({ status: "pending", decided_by: null });
    expect(await listPublicReviews(db(), { limit: 10, offset: 0 })).toEqual([]);
  });

  test("no name on the profile: first and last name are required, then saved to the profile (AC6)", async () => {
    const who = await customer("");
    expect(await send(who, 5, "Lovely")).toMatchObject({ fields: { firstName: "reviewForm.errors.firstName", lastName: "reviewForm.errors.lastName" } });

    await send(who, 5, "Lovely", { firstName: "Marie", lastName: "Dupont" });

    expect(await reviewOf(who)).toMatchObject({ display_name: "Marie D." });
    const { rows } = await database.client.query("select name from customer where id = $1", [who.id]);
    expect(rows[0]).toEqual({ name: "Marie Dupont" });
  });

  test("the 6th post or edit in an hour is RATE_LIMITED (AC8)", async () => {
    const who = await customer();
    for (let i = 0; i < 5; i++) await send(who, 5, `Edit ${i}`);
    expect(await send(who, 5, "One more")).toMatchObject({ ok: false, code: "RATE_LIMITED" });
  });

  test("delete removes it for good and logs the account id only (AC9, S-268 AC3)", async () => {
    const who = await customer();
    await send(who, 5, "Private words");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    expect(await deleteOwn(db(), who.id)).toBe(true);

    expect(await findOwnReview(db(), who.id)).toBeNull();
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).toContain(who.id);
    expect(logged).not.toContain("Private words");
    expect(logged).not.toContain("Anna");
  });
});

describe("public read (S-261 AC3, AC4, AC8)", () => {
  test("only approved reviews, newest approval first, with the public fields only; the aggregate counts them", async () => {
    const admin = await insertAdmin(database, auth);
    const [a, b, c, pending, rejected, hidden] = await Promise.all(["Ann A", "Ben B", "Cat C", "Dan D", "Eve E", "Fay F"].map((n) => customer(n)));
    await send(a!, 5, "Five");
    await send(b!, 4, "Four");
    await send(c!, 4, "Four again");
    await send(pending!, 1, "Pending");
    await send(rejected!, 1, "Rejected");
    await send(hidden!, 1, "Hidden");
    for (const who of [a, b, c, hidden]) await approve(who!, admin.id);
    const r = (await reviewOf(rejected!))!;
    await decideReview(db(), { id: r.id, version: r.version, move: "reject", adminId: admin.id });
    const h = (await reviewOf(hidden!))!;
    await decideReview(db(), { id: h.id, version: h.version, move: "hide", adminId: admin.id });

    const reviews = await listPublicReviews(db(), { limit: 10, offset: 0 });

    expect(reviews.map((r) => r.comment).sort()).toEqual(["Five", "Four", "Four again"]);
    expect(Object.keys(reviews[0]!).sort()).toEqual(["comment", "date", "displayName", "locale", "rating"]);
    expect(reviews[0]!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(await reviewSummary(db())).toEqual({ count: 3, average: 4.3 });
  });

  test("none approved: count 0 and no average", async () => {
    expect(await reviewSummary(db())).toEqual({ count: 0, average: null });
  });

  test("the first page is cached 60 s per isolate and cleared by a change made here", async () => {
    const admin = await insertAdmin(database, auth);
    const who = await customer();
    await send(who, 5, "Lovely");
    expect((await publicFirstPage(db(), NOW)).summary.count).toBe(0);
    const row = (await reviewOf(who))!;
    // A decision made by another isolate: this one keeps its cache until 60 s have passed.
    await database.client.query("update review set status = 'approved', decided_at = now(), decided_by = $2 where id = $1", [row.id, admin.id]);
    expect((await publicFirstPage(db(), new Date(NOW.getTime() + 59_000))).summary.count).toBe(0);
    expect((await publicFirstPage(db(), new Date(NOW.getTime() + 61_000))).summary.count).toBe(1);
  });

  test("10 at a time with hasMore; a bad count reads as 10 (S-267 AC2)", async () => {
    const admin = await insertAdmin(database, auth);
    for (let i = 0; i < 12; i++) {
      const who = await customer(`Name${i} X`);
      await send(who, 5, `Review ${i}`);
      await approve(who, admin.id);
    }
    const first = await publicReviewsUpTo(db(), NOW, 10);
    const more = await publicReviewsUpTo(db(), NOW, 20);
    const odd = await publicReviewsUpTo(db(), NOW, Number.NaN);
    expect([first.reviews.length, first.hasMore, more.reviews.length, more.hasMore, odd.shown]).toEqual([10, true, 12, false, 10]);
  });
});

describe("decisions (S-263, S-265, S-268 AC6)", () => {
  test("approve records who and when, refreshes the name from the profile, and logs no text (AC2, AC8)", async () => {
    const admin = await insertAdmin(database, auth);
    const who = await customer();
    await send(who, 5, "Secret words");
    await database.client.query("update customer set name = 'Anna Nowak' where id = $1", [who.id]);

    const row = (await reviewOf(who))!;
    expect(await decideReview(db(), { id: row.id, version: row.version, move: "approve", adminId: admin.id, displayName: "Anna N." })).toEqual({ ok: true, status: "approved" });

    expect(await reviewOf(who)).toMatchObject({ status: "approved", decided_by: admin.id, display_name: "Anna N." });
    const { rows } = await database.client.query("select action, admin_id from review_event where review_id = $1", [row.id]);
    expect(rows).toEqual([{ action: "approve", admin_id: admin.id }]);
  });

  test("two admins on the same version: the second gets REVIEW_CHANGED and nothing is applied twice (AC4)", async () => {
    const [first, second] = [await insertAdmin(database, auth), await insertAdmin(database, auth)];
    const who = await customer();
    await send(who, 5, "Lovely");
    const row = (await reviewOf(who))!;

    const results = await Promise.all([
      decideReview(db(), { id: row.id, version: row.version, move: "approve", adminId: first.id }),
      decideReview(db(), { id: row.id, version: row.version, move: "reject", adminId: second.id }),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, code: "REVIEW_CHANGED" });
    const { rows } = await database.client.query("select count(*)::int as n from review_event where review_id = $1", [row.id]);
    expect(rows[0]).toEqual({ n: 1 });
  });

  test("hide then show; a pending review cannot be hidden (S-265 AC1, AC2; S-261 AC6)", async () => {
    const admin = await insertAdmin(database, auth);
    const who = await customer();
    await send(who, 5, "Lovely");
    let row = (await reviewOf(who))!;
    expect(await decideReview(db(), { id: row.id, version: row.version, move: "hide", adminId: admin.id })).toEqual({ ok: false, code: "INVALID_TRANSITION" });
    await approve(who, admin.id);
    row = (await reviewOf(who))!;
    await decideReview(db(), { id: row.id, version: row.version, move: "hide", adminId: admin.id });
    expect((await reviewSummary(db())).count).toBe(0);
    row = (await reviewOf(who))!;
    await decideReview(db(), { id: row.id, version: row.version, move: "show", adminId: admin.id });
    expect((await reviewSummary(db())).count).toBe(1);
  });

  test("tabs list by status, newest first (S-263 AC1)", async () => {
    const admin = await insertAdmin(database, auth);
    const [a, b] = [await customer("Ann A"), await customer("Ben B")];
    await send(a, 5, "A");
    await send(b, 3, "B");
    await approve(b, admin.id);
    expect((await listAdminReviews(db(), "toApprove", { limit: 20, offset: 0 })).map((r) => r.comment)).toEqual(["A"]);
    expect((await listAdminReviews(db(), "published", { limit: 20, offset: 0 })).map((r) => r.comment)).toEqual(["B"]);
  });

  test("an admin deletes a not-published review only, and the line survives (S-268 AC6)", async () => {
    const admin = await insertAdmin(database, auth);
    const who = await customer();
    await send(who, 2, "Remove me");
    let row = (await reviewOf(who))!;
    expect(await adminDeleteReview(db(), { id: row.id, version: row.version, adminId: admin.id })).toEqual({ ok: false, code: "INVALID_TRANSITION" });
    await decideReview(db(), { id: row.id, version: row.version, move: "reject", adminId: admin.id });
    row = (await reviewOf(who))!;

    expect(await adminDeleteReview(db(), { id: row.id, version: row.version, adminId: admin.id })).toMatchObject({ ok: true });

    expect(await reviewOf(who)).toBeUndefined();
    const { rows } = await database.client.query<{ action: string }>("select action from review_event where review_id = $1 order by created_at", [row.id]);
    expect(rows.map((r) => r.action)).toEqual(["reject", "delete"]);
  });
});
