// S-252 AC1, AC4, AC5 and S-253 AC1, AC5: the `site/custom-order` loader (PGlite) and its head;
// E-08: the request form's loader data and the submitCustomRequest action (S-151, S-154, S-162).
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { siteSettingsCache } from "~/server/repos/settings.server";
import { routeArgs } from "~/server/testing/route-context";
import { requestForm, REQUEST_NOW } from "~/server/testing/custom-requests";
import type { TurnstileCheck } from "~/server/turnstile.server";
import { action, loader, meta } from "./custom-order";

let database: TestDatabase;

beforeEach(async () => {
  siteSettingsCache.clear();
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  siteSettingsCache.clear();
  await database.close();
});

const load = (path = "/custom-cake") => loader(routeArgs(database, { path }) as never);

describe("site/custom-order loader (S-252)", () => {
  test("AC1: localised title and text; contacts from Settings", async () => {
    await database.client.query(`update settings set contact_whatsapp = '+230 5000 0000'`);

    const data = await load("/fr/custom-cake");

    expect(data.title).toBe("Gâteau sur mesure");
    expect(data.text.intro).toMatch(/gâteau/i);
    expect(data.whatsapp).toBe("+230 5000 0000");
  });

  test("AC4 / E-08 S-154 AC3: a malformed or unknown ?fromGallery= is ignored: no photo, no error", async () => {
    expect((await load("/custom-cake?fromGallery=%3Cscript%3E")).form.attachedGalleryPhoto).toBeNull();
    expect((await load("/custom-cake?fromGallery=7c9e6679-7425-40de-944b-e07fc1f90ae7")).form.attachedGalleryPhoto).toBeNull();
  });

  test("E-08 S-154 AC1: a gallery photo id attaches that photo to the form", async () => {
    const { rows } = await database.client.query<{ id: string }>("insert into gallery_photo (storage_path, width, height) values ('gallery/a.webp', 1600, 1200) returning id");
    const data = await load(`/custom-cake?fromGallery=${rows[0]!.id}`);
    expect(data.form.attachedGalleryPhoto).toEqual({ id: rows[0]!.id, url: "https://storage.test/storage/v1/object/public/public-images/gallery/a.webp" });
  });

  test("E-08 S-151: fresh idempotency key and upload session per render; public date rules only; no Turnstile key without one", async () => {
    await database.client.query("insert into blocked_date (starts_on, ends_on, reason) values ('2026-11-20', '2026-11-21', 'Private reason')");
    const [a, b] = [await load(), await load()];
    expect(a.form.idempotencyKey).not.toBe(b.form.idempotencyKey);
    expect(a.form.uploadSessionId).not.toBe(b.form.uploadSessionId);
    expect(a.form.availability.blocked).toEqual([{ startsOn: "2026-11-20", endsOn: "2026-11-21" }]);
    expect(JSON.stringify(a)).not.toContain("Private reason");
    expect(a.form.turnstileSiteKey).toBeNull();
  });

  test("AC5: the notice period is the Settings default notice days", async () => {
    await database.client.query(`update settings set default_notice_days = 5`);

    expect((await load()).noticeDays).toBe(5);
  });
});

describe("Custom order head (S-253 AC1, AC3, AC5)", () => {
  test("placeholder: noindex; canonical has no query; share tags carry title and description", async () => {
    const loaderData = await load("/custom-cake?fromGallery=abc");

    const tags = meta({ loaderData, matches: [{ id: "root", loaderData: { origin: "https://apb.test" } }], location: { pathname: "/custom-cake" } } as never);

    expect(tags).toContainEqual({ title: "Custom order | Aux petits bonheurs" });
    expect(tags).toContainEqual({ name: "robots", content: "noindex" });
    expect(tags).toContainEqual({ tagName: "link", rel: "canonical", href: "https://apb.test/custom-cake" });
    expect(tags).toContainEqual({ property: "og:title", content: "Custom order | Aux petits bonheurs" });
    expect(tags).toContainEqual({ property: "og:description", content: loaderData.description });
  });
});

describe("site/custom-cake submitCustomRequest action (E-08)", () => {
  const post = (form: Record<string, string | string[]>, options: { path?: string; turnstile?: TurnstileCheck; ip?: string } = {}) =>
    action(routeArgs(database, { path: options.path ?? "/custom-cake", form, now: REQUEST_NOW, turnstile: options.turnstile, headers: { "cf-connecting-ip": options.ip ?? "198.51.100.70" } }) as never) as Promise<unknown>;
  const body = (result: unknown) => (result as { data: { error: { code: string; fields?: Record<string, string> }; values?: Record<string, string> } }).data;
  const strings = (form: ReturnType<typeof requestForm>) => form as Record<string, string | string[]>;

  test("S-151 AC1: a valid request redirects to its confirmation page; from /fr it is a French request", async () => {
    const response = (await post(strings(requestForm()))) as Response;
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toMatch(/^\/order\/[A-Za-z0-9_-]{43}\/confirmed$/);

    const fr = (await post(strings(requestForm()), { path: "/fr/custom-cake" })) as Response;
    expect(fr.headers.get("Location")).toMatch(/^\/fr\/order\//);
    const { rows } = await database.client.query<{ locale: string }>("select locale from orders order by number");
    expect(rows.map((r) => r.locale)).toEqual(["en", "fr"]);
  });

  test("S-151 AC4: field errors in the page language, values echoed, nothing created", async () => {
    const result = body(await post(strings(requestForm({ servings: "0", flavours: undefined })), { path: "/fr/custom-cake" }));
    expect(result.error.code).toBe("VALIDATION_FAILED");
    expect(result.error.fields).toEqual({ servings: "Indiquez un nombre de personnes entre 1 et 500", flavours: "Indiquez les parfums souhaités" });
    expect(result.values).toMatchObject({ servings: "0", "contact.name": "Aisha Test", details: "Two tiers, a lion on top." });
  });

  test("S-162 AC2/AC4: the 4th request is RATE_LIMITED with Retry-After, a WhatsApp hint, and the text kept", async () => {
    for (let i = 0; i < 3; i += 1) await post(strings(requestForm()), { ip: "203.0.113.90" });
    const refused = (await post(strings(requestForm({ details: "Keep me" })), { ip: "203.0.113.90" })) as { init: ResponseInit; data: ReturnType<typeof body> };
    expect(refused.init.status).toBe(429);
    expect(new Headers(refused.init.headers).get("Retry-After")).toMatch(/^\d+$/);
    expect(refused.data.error.fields?.form).toContain("WhatsApp");
    expect(refused.data.values?.details).toBe("Keep me");
  });

  test("S-162 AC1: a failed bot check is BOT_CHECK_FAILED and creates nothing", async () => {
    const refusing: TurnstileCheck = { siteKey: "site", verify: async () => "failed" };
    const result = body(await post(strings(requestForm()), { turnstile: refusing }));
    expect(result.error.code).toBe("BOT_CHECK_FAILED");
    const { rows } = await database.client.query("select 1 from orders");
    expect(rows).toHaveLength(0);
  });

  test("S-151 AC3: DATE_UNAVAILABLE says why in the field error and keeps the form", async () => {
    const result = body(await post(strings(requestForm({ date: "2026-11-08" }))));
    expect(result.error.code).toBe("DATE_UNAVAILABLE");
    expect(result.error.fields?.date).toBeTruthy();
    expect(result.values?.flavours).toBe("Chocolate and passion fruit");
  });
});
