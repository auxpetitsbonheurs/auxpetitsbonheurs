// E-13 S-246 AC1, AC6, AC9: the admin Pages list and editor loaders: five pages with the
// "Sample text" badge and last edit, open to Admins and Owners, refused to everyone else.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { signedInAdmin } from "~/server/testing/admin-session";
import { insertCustomerAccount } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { routeArgs } from "~/server/testing/route-context";
import { action as editorAction, loader as editorLoader } from "./page-editor";
import { loader as listLoader } from "./pages";

let database: TestDatabase;
let admin: Awaited<ReturnType<typeof signedInAdmin>>;
let owner: Awaited<ReturnType<typeof signedInAdmin>>;

beforeAll(async () => {
  database = await createTestDatabase();
  admin = await signedInAdmin(database, { role: "admin", name: "Sarah" });
  owner = await signedInAdmin(database, { role: "owner", name: "Anne" });
}, 60_000);

afterAll(async () => {
  await database.close();
});

const as = (session: { auth: FakeAuth; cookie?: string }, path: string, params: Record<string, string> = {}) => routeArgs(database, { path, params, auth: session.auth, cookie: session.cookie });

async function outcome(run: () => Promise<unknown>): Promise<unknown> {
  try {
    return await run();
  } catch (error) {
    return error;
  }
}

describe("AC1: the Pages list", () => {
  test("five pages in order, each with a Sample text flag until edited, and who edited when", async () => {
    await database.client.query("update site_page set is_placeholder = false, updated_by = $1, updated_at = '2026-11-12T10:05:00Z' where key = 'workshops'", [admin.admin.id]);

    const page = await listLoader(as(admin, "/admin/pages") as never);

    expect(page.title).toBe("Pages");
    expect(page.pages.map((p) => [p.key, p.name, p.isPlaceholder])).toEqual([
      ["our_story", "Our story", true],
      ["workshops", "Workshops", false],
      ["gallery", "Gallery", true],
      ["contact", "Contact us", true],
      ["custom_order", "Custom order", true],
    ]);
    expect(page.pages[1]!.edited).toEqual({ when: "12 Nov 14:05", name: "Sarah" });
    expect(page.pages[0]!.edited).toBeNull();
  });
});

describe("AC6: Admins and Owners; nobody else", () => {
  test("an Admin opens the list and an editor", async () => {
    const page = await editorLoader(as(admin, "/admin/pages/our_story", { key: "our_story" }) as never);

    expect(page).toMatchObject({ key: "our_story", title: "Our story", fields: ["intro", "body"], photoLimit: 4, version: 1, isPlaceholder: true });
  });

  test("anonymous: the login redirect for the list, the editor and a save", async () => {
    const anonymous = { auth: new FakeAuth() };
    for (const run of [
      () => listLoader(as(anonymous, "/admin/pages") as never),
      () => editorLoader(as(anonymous, "/admin/pages/our_story", { key: "our_story" }) as never),
      () => editorAction(routeArgs(database, { path: "/admin/pages/our_story", params: { key: "our_story" }, auth: anonymous.auth, form: { intent: "save" } }) as never),
    ]) {
      const result = (await outcome(run)) as Response;
      expect(result.headers.get("Location")).toMatch(/^\/admin\/login\?next=/);
    }
  });

  test("a signed-in customer gets FORBIDDEN on save and nothing changes", async () => {
    const auth = new FakeAuth();
    const customer = await insertCustomerAccount(database, auth);
    const cookie = auth.sessionCookie(customer.id, new Date("2026-11-09T08:00:00Z"));

    const result = (await outcome(() => editorAction(routeArgs(database, { path: "/admin/pages/gallery", params: { key: "gallery" }, auth, cookie, form: { intent: "save", version: "1", "intro.en": "Hacked" } }) as never))) as { init?: { status: number }; data?: { error: { code: string } } };

    expect(result.init?.status).toBe(403);
    expect(result.data?.error.code).toBe("FORBIDDEN");
    expect((await database.client.query("select content->'intro'->>'en' as intro from site_page where key = 'gallery'")).rows[0]).toEqual({ intro: expect.stringMatching(/^Sample text/) });
  });

  test("an unknown page key is a 404 admin state", async () => {
    const result = (await outcome(() => editorLoader(as(admin, "/admin/pages/home", { key: "home" }) as never))) as { init?: { status: number } };

    expect(result.init?.status).toBe(404);
  });
});

describe("AC9: contact details are changed in Settings", () => {
  test("the contact editor tells an Owner (link) and an Admin (text) apart", async () => {
    const forOwner = await editorLoader(as(owner, "/admin/pages/contact", { key: "contact" }) as never);
    const forAdmin = await editorLoader(as(admin, "/admin/pages/contact", { key: "contact" }) as never);

    expect(forOwner).toMatchObject({ key: "contact", fields: ["intro", "hours", "pickup_note"], photoLimit: 0, isOwner: true });
    expect(forAdmin.isOwner).toBe(false);
  });
});
