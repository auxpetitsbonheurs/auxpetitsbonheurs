// S-202: the Owner edits the WhatsApp templates in Settings (save, validation, preview, access).
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { DEFAULT_WHATSAPP_TEMPLATES, WHATSAPP_TEMPLATE_KEYS } from "~/domain/whatsapp";
import { signedInAdmin } from "~/server/testing/admin-session";
import { placeTestOrder } from "~/server/testing/orders";
import { routeArgs } from "~/server/testing/route-context";
import { loadedSettingsForm } from "~/server/testing/settings-form";
import { loader as orderLoader } from "./order";
import { action, loader } from "./settings";

let database: TestDatabase;

beforeEach(async () => {
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  await database.close();
});

type Session = Awaited<ReturnType<typeof signedInAdmin>>;
type Refusal = { data: { ok: false; error: { code: string; fields?: Record<string, string> } }; init: { status: number } };

const templateFields = (overrides: Record<string, string> = {}) => ({
  ...Object.fromEntries(WHATSAPP_TEMPLATE_KEYS.flatMap((key) => [[`whatsappTemplates.${key}.en`, DEFAULT_WHATSAPP_TEMPLATES[key].en], [`whatsappTemplates.${key}.fr`, DEFAULT_WHATSAPP_TEMPLATES[key].fr ?? ""]])),
  ...overrides,
});

async function save(session: Session, overrides: Record<string, string>) {
  const form = await loadedSettingsForm(database, templateFields(overrides));
  return action(routeArgs(database, { path: "/admin/settings", auth: session.auth, cookie: session.cookie, form }) as never) as Promise<unknown>;
}

const load = async (session: Session) =>
  (await loader(routeArgs(database, { path: "/admin/settings", auth: session.auth, cookie: session.cookie }) as never)) as unknown as {
    settings: { whatsappTemplates: Record<string, { en: string; fr?: string }> };
    previewSample: Record<"en" | "fr", Record<string, string | null>>;
  };

describe("Settings > WhatsApp templates (S-202)", () => {
  test("AC1: the five templates are loaded with the defaults, with sample values per language for the preview", async () => {
    const owner = await signedInAdmin(database, { role: "owner" });

    const page = await load(owner);

    expect(Object.keys(page.settings.whatsappTemplates)).toEqual([...WHATSAPP_TEMPLATE_KEYS]);
    expect(page.settings.whatsappTemplates.approved).toEqual(DEFAULT_WHATSAPP_TEMPLATES.approved);
    expect(page.previewSample.en).toMatchObject({ name: "Aisha", order_number: "APB-0042", total: "Rs 1,250" });
    expect(page.previewSample.fr.window).toMatch(/^Matin/);
  });

  test("AC2: valid templates are stored and the next order message uses them", async () => {
    const owner = await signedInAdmin(database, { role: "owner" });

    expect(await save(owner, { "whatsappTemplates.blank.en": "Hi {name}! Order {order_number}." })).toMatchObject({ ok: true });

    const { token } = await placeTestOrder(database);
    const id = (await database.client.query<{ id: string }>("select id from orders where tracking_token = $1", [token])).rows[0]!.id;
    const page = (await orderLoader(routeArgs(database, { path: `/admin/orders/${id}`, params: { id }, auth: owner.auth, cookie: owner.cookie }) as never)) as unknown as { whatsapp: { templates: { key: string; url: string }[] } };
    const blank = page.whatsapp.templates.find((item) => item.key === "blank")!;
    expect(new URL(blank.url).searchParams.get("text")).toMatch(/^Hi Aisha! Order APB-\d{4}\.$/);
  });

  test("AC3: an unknown placeholder refuses the save with an error on that template and language; nothing is saved", async () => {
    const owner = await signedInAdmin(database, { role: "owner" });

    const result = (await save(owner, { "whatsappTemplates.ready.fr": "Prête {foo}" })) as Refusal;

    expect(result.data.error.code).toBe("VALIDATION_FAILED");
    expect(Object.keys(result.data.error.fields ?? {})).toEqual(["whatsappTemplates.ready.fr"]);
    expect(result.data.error.fields?.["whatsappTemplates.ready.fr"]).toMatch(/^Order ready \(French\): use only the placeholders/);
    const { rows } = await database.client.query<{ whatsapp_templates: unknown }>("select whatsapp_templates from settings");
    expect(rows[0]!.whatsapp_templates).toBeNull();
  });

  test("AC4: an Admin who is not Owner gets 403 and nothing is saved", async () => {
    const admin = await signedInAdmin(database, { role: "admin" });

    const refused = (await save(admin, { "whatsappTemplates.blank.en": "Hacked" }).catch((error: unknown) => error)) as Refusal;

    expect(refused.init.status).toBe(403);
    const { rows } = await database.client.query<{ whatsapp_templates: unknown }>("select whatsapp_templates from settings");
    expect(rows[0]!.whatsapp_templates).toBeNull();
  });

  test("AC5: another Owner saved first: SETTINGS_CHANGED and no overwrite", async () => {
    const owner = await signedInAdmin(database, { role: "owner" });
    const stale = await loadedSettingsForm(database, templateFields({ "whatsappTemplates.blank.en": "Mine {name}" }));
    expect(await save(owner, { "whatsappTemplates.blank.en": "First {name}" })).toMatchObject({ ok: true });

    const result = (await action(routeArgs(database, { path: "/admin/settings", auth: owner.auth, cookie: owner.cookie, form: stale }) as never)) as Refusal;

    expect(result.data.error.code).toBe("SETTINGS_CHANGED");
    expect((await load(owner)).settings.whatsappTemplates.blank!.en).toBe("First {name}");
  });

  test("AC6: an empty French text is kept empty (the English one is used)", async () => {
    const owner = await signedInAdmin(database, { role: "owner" });

    await save(owner, { "whatsappTemplates.ready.fr": "" });

    expect((await load(owner)).settings.whatsappTemplates.ready).toEqual({ en: DEFAULT_WHATSAPP_TEMPLATES.ready.en });
  });

  test("a Settings save that does not post the templates keeps the stored ones", async () => {
    const owner = await signedInAdmin(database, { role: "owner" });
    await save(owner, { "whatsappTemplates.blank.en": "Kept {name}" });

    const form = await loadedSettingsForm(database);
    expect(await action(routeArgs(database, { path: "/admin/settings", auth: owner.auth, cookie: owner.cookie, form }) as never)).toMatchObject({ ok: true });

    expect((await load(owner)).settings.whatsappTemplates.blank!.en).toBe("Kept {name}");
  });

  test("AC9: the error text exists in French", async () => {
    const owner = await signedInAdmin(database, { role: "owner", locale: "fr" });

    const result = (await save(owner, { "whatsappTemplates.approved.en": "" })) as Refusal;

    expect(result.data.error.fields?.["whatsappTemplates.approved.en"]).toBe("Commande confirmée : écrivez le texte anglais (le français est facultatif).");
  });
});
