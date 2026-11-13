// E-14 routes: S-262 (review-write guard and save), S-263/S-265 (admin reviews guard and
// decisions), S-264 (badge), S-266 (Home section), S-267 (public page payload, SEO, sitemap),
// S-268 AC5 (no rating markup).
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { action as adminAction, loader as adminLoader } from "~/routes/admin/reviews";
import { loader as layoutLoader } from "~/routes/admin/layout";
import { loader as homeLoader } from "~/routes/home";
import { sitemapPaths } from "~/server/seo-pages.server";
import { clearReviewCache } from "~/server/services/reviews.server";
import { insertAdmin, insertCustomerAccount } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { type RouteArgsOptions, routeArgs } from "~/server/testing/route-context";
import { action as writeAction, loader as writeLoader } from "./review-write";
import { loader as reviewsLoader, meta as reviewsMeta } from "./reviews";

let database: TestDatabase;
let auth: FakeAuth;

beforeAll(async () => {
  database = await createTestDatabase();
}, 60_000);

beforeEach(async () => {
  auth = new FakeAuth();
  clearReviewCache();
  await database.client.exec("delete from review; delete from review_event; delete from rate_limit_bucket");
});

afterAll(async () => {
  await database.close();
});

type Envelope = { data: { ok: false; error: { code: string; fields?: Record<string, string> } }; init: { status: number } };
const session = (id: string) => auth.sessionCookie(id, new Date("2026-11-10T07:00:00Z"));

async function call<T>(work: () => Promise<T>): Promise<T | Response | Envelope> {
  try {
    return await work();
  } catch (thrown) {
    if (thrown instanceof Response || (thrown && typeof thrown === "object" && "init" in thrown)) return thrown as Response | Envelope;
    throw thrown;
  }
}

const write = (form: Record<string, string>, options: Partial<RouteArgsOptions>) => call(() => writeAction(routeArgs(database, { path: "/reviews/write", auth, form, ...options }) as never));
const decide = (form: Record<string, string>, cookie: string) => call(() => adminAction(routeArgs(database, { path: "/admin/reviews", auth, form, cookie }) as never));

async function postedReview(comment = "Best cakes <b>ever</b>") {
  const customer = await insertCustomerAccount(database, auth);
  await database.client.query("update customer set name = 'Anna Kowalski' where auth_user_id = $1", [customer.id]);
  expect(await write({ intent: "save", rating: "5", comment }, { cookie: session(customer.id) })).toMatchObject({ ok: true, intent: "save" });
  const { rows } = await database.client.query<{ id: string; version: number }>("select r.id, r.version from review r join customer c on c.id = r.customer_id where c.auth_user_id = $1", [customer.id]);
  return { customer, review: rows[0]! };
}

describe("review form guard (S-262 AC1, AC8)", () => {
  test("signed out: the page offers sign-in with next; the action is UNAUTHENTICATED and writes nothing", async () => {
    const data = await writeLoader(routeArgs(database, { path: "/fr/reviews/write", auth }) as never);
    expect(data).toMatchObject({ signedIn: false, path: "/fr/reviews/write" });
    const answer = (await write({ intent: "save", rating: "5", comment: "x" }, {})) as Envelope;
    expect(answer.init.status).toBe(401);
    expect((await database.client.query("select 1 from review")).rows).toEqual([]);
  });

  test("an admin session is FORBIDDEN and writes nothing", async () => {
    const admin = await insertAdmin(database, auth);
    const answer = (await write({ intent: "save", rating: "5", comment: "x" }, { cookie: session(admin.id) })) as Envelope;
    expect(answer.init.status).toBe(403);
  });

  test("a customer sees their own review with its status in words (S-262 AC5)", async () => {
    const { customer } = await postedReview();
    const data = await writeLoader(routeArgs(database, { path: "/reviews/write", auth, cookie: session(customer.id) }) as never);
    expect(data).toMatchObject({ signedIn: true, needsName: false, review: { rating: 5, state: "waiting" } });
  });
});

describe("admin reviews (S-263, S-264, S-265)", () => {
  test("customer and anonymous: the page redirects to the admin login, the action is refused (S-263 AC6)", async () => {
    const customer = await insertCustomerAccount(database, auth);
    for (const cookie of [undefined, session(customer.id)]) {
      const page = (await call(() => adminLoader(routeArgs(database, { path: "/admin/reviews", auth, cookie }) as never))) as Response;
      expect(page.headers.get("Location")).toContain("/admin/login");
    }
    const refused = (await decide({ intent: "approve", id: crypto.randomUUID(), version: "1" }, session(customer.id))) as Envelope;
    expect(refused.init.status).toBe(403);
  });

  test("an Admin (not only the Owner) lists To approve with counts and approves; the badge counts pending (S-263 AC1, AC2; S-264 AC1)", async () => {
    const admin = await insertAdmin(database, auth, { role: "admin" });
    const { review } = await postedReview();
    const layout = (await layoutLoader(routeArgs(database, { path: "/admin", auth, cookie: session(admin.id) }) as never)) as { badges: { reviewsToApprove: number } };
    expect(layout.badges.reviewsToApprove).toBe(1);

    const list = (await adminLoader(routeArgs(database, { path: "/admin/reviews", auth, cookie: session(admin.id) }) as never)) as { counts: Record<string, number>; reviews: { id: string; moves: string[]; comment: string }[] };
    expect(list.counts).toEqual({ toApprove: 1, published: 0, notPublished: 0 });
    expect(list.reviews[0]).toMatchObject({ id: review.id, moves: ["approve", "reject"], comment: "Best cakes <b>ever</b>" });

    expect(await decide({ intent: "approve", id: review.id, version: String(review.version) }, session(admin.id))).toMatchObject({ ok: true, intent: "approve" });
    const after = (await layoutLoader(routeArgs(database, { path: "/admin", auth, cookie: session(admin.id) }) as never)) as { badges: { reviewsToApprove: number } };
    expect(after.badges.reviewsToApprove).toBe(0);
  });

  test("a stale version is REVIEW_CHANGED (409) (S-263 AC4, S-265 AC5)", async () => {
    const admin = await insertAdmin(database, auth);
    const { review } = await postedReview();
    await decide({ intent: "reject", id: review.id, version: String(review.version) }, session(admin.id));
    const second = (await decide({ intent: "approve", id: review.id, version: String(review.version) }, session(admin.id))) as Envelope;
    expect(second.init.status).toBe(409);
    expect(second.data.error.code).toBe("REVIEW_CHANGED");
  });

  test("undo puts an approval back to To approve, only for the approving admin (S-263 AC2)", async () => {
    const [admin, other] = [await insertAdmin(database, auth), await insertAdmin(database, auth)];
    const { review } = await postedReview();
    await decide({ intent: "approve", id: review.id, version: String(review.version) }, session(admin.id));
    expect(((await decide({ intent: "undo", id: review.id, version: String(review.version + 1) }, session(other.id))) as Envelope).data.error.code).toBe("INVALID_TRANSITION");
    expect(await decide({ intent: "undo", id: review.id, version: String(review.version + 1) }, session(admin.id))).toMatchObject({ ok: true });
    const { rows } = await database.client.query("select status from review where id = $1", [review.id]);
    expect(rows).toEqual([{ status: "pending" }]);
  });

  test("bad input is VALIDATION_FAILED", async () => {
    const admin = await insertAdmin(database, auth);
    expect(((await decide({ intent: "publish", id: "x", version: "0" }, session(admin.id))) as Envelope).init.status).toBe(400);
  });
});

describe("public reads (S-266, S-267, S-268 AC5)", () => {
  test("none approved: Home omits the section; /reviews is noindex and out of the sitemap", async () => {
    await postedReview();
    const home = (await homeLoader(routeArgs(database, { path: "/", auth }) as never)) as { reviews: unknown };
    expect(home.reviews).toBeNull();
    const page = await reviewsLoader(routeArgs(database, { path: "/reviews", auth }) as never);
    expect(page.summary).toEqual({ count: 0, average: null });
    const tags = reviewsMeta({ loaderData: page, matches: [], location: { pathname: "/reviews" } } as never);
    expect(tags).toContainEqual({ name: "robots", content: "noindex" });
    expect(await sitemapPaths(database.db as never)).not.toContain("/reviews");
  });

  test("approved: Home and /reviews show only public fields; no Review/AggregateRating markup; in the sitemap", async () => {
    const admin = await insertAdmin(database, auth);
    const { review } = await postedReview();
    await decide({ intent: "approve", id: review.id, version: String(review.version) }, session(admin.id));
    await postedReview("Pending one, never shown");

    const home = (await homeLoader(routeArgs(database, { path: "/", auth }) as never)) as { reviews: { average: number; count: number; latest: object[] } };
    expect(home.reviews).toMatchObject({ average: 5, count: 1 });
    const page = await reviewsLoader(routeArgs(database, { path: "/reviews", auth }) as never);
    const payload = JSON.stringify(page);
    expect(payload).not.toContain("Pending one");
    expect(payload).not.toContain(review.id);
    expect(Object.keys(page.reviews[0]!).sort()).toEqual(["comment", "date", "displayName", "locale", "rating"]);
    const tags = JSON.stringify(reviewsMeta({ loaderData: page, matches: [], location: { pathname: "/reviews" } } as never));
    expect(tags).not.toMatch(/AggregateRating|"Review"|application\/ld\+json|noindex/);
    expect(await sitemapPaths(database.db as never)).toContain("/reviews");
  });
});
