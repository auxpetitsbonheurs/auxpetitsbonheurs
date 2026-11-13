// `admin/settings` save (S-058 AC5, AC7; S-059 AC2, AC4, AC6, AC7): every bad field is named
// and nothing is saved; a stale version is SETTINGS_CHANGED; new images pass the upload checks.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { action } from "~/routes/admin/settings";
import { signedInAdmin } from "~/server/testing/admin-session";
import { MemoryStorage } from "~/server/testing/memory-storage";
import { routeArgs } from "~/server/testing/route-context";
import { loadedSettingsForm } from "~/server/testing/settings-form";
import { variantPath, withVariantPaths } from "~/domain/upload";

let database: TestDatabase;

beforeEach(async () => {
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  await database.close();
});

type Refusal = { data: { ok: false; error: { code: string; message: string; fields?: Record<string, string> } }; init: { status: number } };

async function post(overrides: Record<string, string | string[]>, options: { storage?: MemoryStorage; form?: Record<string, string | string[]> } = {}) {
  const session = await signedInAdmin(database, { role: "owner" });
  const form = options.form ?? (await loadedSettingsForm(database, overrides));
  const result = await action(
    routeArgs(database, { path: "/admin/settings", auth: session.auth, cookie: session.cookie, form, uploads: options.storage?.gateway ?? null, storage: options.storage?.gateway }) as never,
  );
  return { result: result as unknown, adminId: session.admin.id };
}

const stored = async () => (await database.client.query<{ version: number; delivery_fee_rs: number }>("select version, delivery_fee_rs from settings")).rows[0];

describe("S-058 AC5: invalid business values", () => {
  test("each bad field is marked and nothing is saved", async () => {
    const { result } = await post({
      deliveryFeeRs: "100001",
      pickupMapUrl: "javascript:alert(1)",
      contactPhone: "12",
      contactWhatsapp: "call me",
      contactEmail: "not-an-email",
      juiceNumber: "x".repeat(31),
      juiceName: "x".repeat(61),
      paymentWhatsapp: "not a phone",
      instagramUrl: "instagram",
      quoteValidityDays: "61",
      cakeMessageMax: "9",
      eveningReminderAt: "6pm",
      orderNumberPrefix: "apb-",
    });

    const refused = result as Refusal;
    expect(refused.init.status).toBe(400);
    expect(refused.data.error.code).toBe("VALIDATION_FAILED");
    expect(Object.keys(refused.data.error.fields ?? {}).sort()).toEqual(
      ["cakeMessageMax", "contactEmail", "contactPhone", "contactWhatsapp", "deliveryFeeRs", "eveningReminderAt", "instagramUrl", "juiceName", "juiceNumber", "orderNumberPrefix", "paymentWhatsapp", "pickupMapUrl", "quoteValidityDays"].sort(),
    );
    expect(refused.data.error.fields?.orderNumberPrefix).toBe("Use 1 to 5 capital letters and an optional dash, for example APB-.");
    expect(await stored()).toEqual({ version: 1, delivery_fee_rs: 200 });
  });

  test.each([
    ["deliveryFeeRs", "0"],
    ["deliveryFeeRs", "100000"],
    ["quoteValidityDays", "1"],
    ["quoteValidityDays", "60"],
    ["cakeMessageMax", "10"],
    ["cakeMessageMax", "200"],
    ["orderNumberPrefix", "ABCDE"],
    ["orderNumberPrefix", "A-"],
    ["eveningReminderAt", "23:59"],
  ])("the edge value %s = %s is accepted", async (field, value) => {
    const { result } = await post({ [field]: value });
    expect(result).toMatchObject({ ok: true });
  });

  test("S-277 AC1: the Juice name, number and payment WhatsApp are saved as typed (trimmed)", async () => {
    const { result } = await post({ juiceName: "  A. Baker ", juiceNumber: "5000 0001", paymentWhatsapp: "+230 5000 0002" });
    expect(result).toMatchObject({ ok: true });
    expect((await database.client.query("select juice_name, juice_number, payment_whatsapp from settings")).rows).toEqual([
      { juice_name: "A. Baker", juice_number: "5000 0001", payment_whatsapp: "+230 5000 0002" },
    ]);
  });

  test("blank optional contacts are saved as none", async () => {
    const { result } = await post({ pickupAddress: "", juiceNumber: "", contactEmail: "" });
    expect(result).toMatchObject({ ok: true });
    expect((await database.client.query("select pickup_address, juice_number, contact_email from settings")).rows).toEqual([{ pickup_address: null, juice_number: null, contact_email: null }]);
  });
});

describe("S-058 AC7, S-059 AC7: a stale version", () => {
  test("the second Owner saving the version they loaded gets SETTINGS_CHANGED and nothing is saved", async () => {
    const loaded = await loadedSettingsForm(database);
    expect((await post({}, { form: { ...loaded, deliveryFeeRs: "250" } })).result).toMatchObject({ ok: true, version: 2 });

    const refused = (await post({}, { form: { ...loaded, deliveryFeeRs: "300", "about.en": "Changed" } })).result as Refusal;

    expect(refused.init.status).toBe(409);
    expect(refused.data.error).toEqual({ code: "SETTINGS_CHANGED", message: "Someone changed this. Reload." });
    expect(await stored()).toEqual({ version: 2, delivery_fee_rs: 250 });
    expect((await database.client.query("select about from settings")).rows).toEqual([{ about: null }]);
  });
});

describe("S-059 AC2: text limits", () => {
  test.each([
    ["about.fr", 10_001, "The About text in French is too long (10,000 characters at most)."],
    ["policies.en", 10_001, "The policies text in English is too long (10,000 characters at most)."],
    ["heroTagline.en", 201, "The tagline in English is too long (200 characters at most)."],
  ])("%s of %i characters is VALIDATION_FAILED and nothing is saved", async (field, length, message) => {
    const { result } = await post({ "about.en": "About", [field]: "a".repeat(length) });
    const refused = result as Refusal;
    expect(refused.data.error.fields).toEqual({ [field]: message });
    expect(await stored()).toEqual({ version: 1, delivery_fee_rs: 200 });
  });

  test("exactly 10,000 characters and a 200-character tagline are accepted", async () => {
    const { result } = await post({ "about.en": "a".repeat(10_000), "heroTagline.en": "t".repeat(200) });
    expect(result).toMatchObject({ ok: true });
  });
});

describe("S-059 AC4: policies keep the cancellation and storage entries", () => {
  test.each([
    [{ "policies.en": "Payment by Juice only." }, true],
    [{ "policies.en": "CANCELLATION up to 48 h. Storage: fridge.", "policies.fr": "Paiement par Juice." }, true],
    [{ "policies.en": "Cancellation up to 48 h. Storage: fridge.", "policies.fr": "Annulation 48 h. Conservation au frais." }, false],
    [{ "policies.en": "Cancellation up to 48 h. Storage: fridge.", "policies.fr": "" }, false],
  ])("%o saves with warning %s", async (policies, warned) => {
    const { result } = await post(policies);
    expect(result).toMatchObject({ ok: true, warnings: { policies: warned } });
    expect(await stored()).toMatchObject({ version: 2 });
  });
});

const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0, 0, 0, 1, 2, 3]);
const SESSION = "6f1c1f4e-3b7a-4d5e-9c3b-2a1d0e9f8c7b";

describe("S-059 AC6: hero and About images follow the product photo rules", () => {
  test("an image issued to this Owner for this page and really a WebP is saved; the replaced one is removed", async () => {
    const storage = new MemoryStorage();
    const session = await signedInAdmin(database, { role: "owner" });
    const first = `site/${session.admin.id}/${SESSION}/0b8e7c52-6a3f-4a1e-9d2c-5f4b3a2e1d0c.webp`;
    const second = `site/${session.admin.id}/${SESSION}/1c9f8d63-7b4a-4b2f-8e3d-6a5c4b3f2e1d.webp`;
    storage.objects.set(`public-images/${first}`, { bytes: WEBP, contentType: "image/webp" });
    storage.objects.set(`public-images/${second}`, { bytes: WEBP, contentType: "image/webp" });
    const send = async (path: string) =>
      action(routeArgs(database, { path: "/admin/settings", auth: session.auth, cookie: session.cookie, uploads: storage.gateway, storage: storage.gateway, form: await loadedSettingsForm(database, { heroImagePath: path, uploadSessionId: SESSION }) }) as never);

    expect(await send(first)).toMatchObject({ ok: true });
    expect(await send(second)).toMatchObject({ ok: true });

    expect((await database.client.query("select hero->>'imagePath' as path from settings")).rows).toEqual([{ path: second }]);
    expect(storage.removed).toEqual(withVariantPaths([first]));
  });

  test("S-276 AC2: the hero image's stored copies are recorded, kept while it stays, cleared when it goes", async () => {
    const storage = new MemoryStorage();
    const session = await signedInAdmin(database, { role: "owner" });
    const hero = `site/${session.admin.id}/${SESSION}/2d0a9e74-8c5b-4c3a-9f4e-7b6d5c4a3f2e.webp`;
    for (const path of [hero, variantPath(hero, 480), variantPath(hero, 960)]) storage.objects.set(`public-images/${path}`, { bytes: WEBP, contentType: "image/webp" });
    const send = async (path: string | null) =>
      action(routeArgs(database, { path: "/admin/settings", auth: session.auth, cookie: session.cookie, uploads: storage.gateway, storage: storage.gateway, form: await loadedSettingsForm(database, { heroImagePath: path ?? "", uploadSessionId: SESSION }) }) as never);
    const widths = async () => (await database.client.query("select hero_image_variants from settings")).rows[0];

    expect(await send(hero)).toMatchObject({ ok: true });
    expect(await widths()).toEqual({ hero_image_variants: [480, 960] });
    expect(await send(hero)).toMatchObject({ ok: true });
    expect(await widths()).toEqual({ hero_image_variants: [480, 960] });
    expect(await send(null)).toMatchObject({ ok: true });
    expect(await widths()).toEqual({ hero_image_variants: [] });
  });

  test("a path not issued to this Owner, or a stored file that is not an image, is UPLOAD_REJECTED and nothing is saved", async () => {
    const storage = new MemoryStorage();
    const session = await signedInAdmin(database, { role: "owner" });
    const notImage = `site/${session.admin.id}/${SESSION}/2d0a9e74-8c5b-4c3a-9f4e-7b6d5c4a3f2e.webp`;
    storage.objects.set(`public-images/${notImage}`, { bytes: new TextEncoder().encode("<script>alert(1)</script>"), contentType: "image/webp" });
    const send = async (overrides: Record<string, string>) =>
      (await action(routeArgs(database, { path: "/admin/settings", auth: session.auth, cookie: session.cookie, uploads: storage.gateway, form: await loadedSettingsForm(database, { uploadSessionId: SESSION, ...overrides }) }) as never)) as unknown as Refusal;

    const foreign = await send({ aboutImagePath: `products/${session.admin.id}/${SESSION}/2d0a9e74-8c5b-4c3a-9f4e-7b6d5c4a3f2e.webp` });
    const fake = await send({ heroImagePath: notImage });

    expect(foreign.data.error).toMatchObject({ code: "UPLOAD_REJECTED", fields: { aboutImagePath: "The About photo could not be used. Choose it again." } });
    expect(fake.data.error).toMatchObject({ code: "UPLOAD_REJECTED", fields: { heroImagePath: "The homepage photo could not be used. Choose it again." } });
    expect(await stored()).toEqual({ version: 1, delivery_fee_rs: 200 });
  });
});
