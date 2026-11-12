// S-058 (business settings) and S-059 (site content): the Owner's Settings page loads every
// value, and a save shows on the site on the next request without a deployment.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { insertProduct } from "~/db/testing/catalogue";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { localized } from "~/i18n/localized";
import { getSiteSettings } from "~/server/repos/settings.server";
import type { Database } from "~/server/db.server";
import { signedInAdmin } from "~/server/testing/admin-session";
import { DELIVERY_ORDER, placeTestOrder } from "~/server/testing/orders";
import { routeArgs } from "~/server/testing/route-context";
import { loadedSettingsForm } from "~/server/testing/settings-form";
import { loader as basketLoader } from "../site/basket";
import { loader as trackingLoader } from "../site/tracking";
import { loader as ordersLoader } from "./orders";
import { action, loader } from "./settings";

let database: TestDatabase;

beforeEach(async () => {
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  await database.close();
});

type Refusal = { data: { ok: false; error: { code: string; fields?: Record<string, string> } }; init: { status: number } };

async function owner() {
  return signedInAdmin(database, { role: "owner" });
}

async function save(overrides: Record<string, string | string[]> = {}) {
  const session = await owner();
  const form = await loadedSettingsForm(database, overrides);
  return action(routeArgs(database, { path: "/admin/settings", auth: session.auth, cookie: session.cookie, form }) as never) as Promise<unknown>;
}

const db = () => database.db as unknown as Database;

describe("S-058 AC1: the Owner sees every business value", () => {
  test("delivery fee, pickup, contacts, Juice, Instagram, quote validity, message maximum, reminder time and prefix", async () => {
    const session = await owner();
    const page = await loader(routeArgs(database, { path: "/admin/settings", auth: session.auth, cookie: session.cookie }) as never);

    expect(page.settings).toMatchObject({
      version: 1,
      deliveryFeeRs: 200,
      pickupAddress: "Beau Bassin",
      pickupMapUrl: null,
      contactPhone: null,
      contactWhatsapp: null,
      contactEmail: null,
      juiceNumber: "5000 0000",
      instagramUrl: null,
      quoteValidityDays: 5,
      cakeMessageMax: 40,
      eveningReminderAt: "18:00",
      orderNumberPrefix: "APB-",
    });
    expect(page.resendUsage).toBeNull();
  });
});

describe("S-058 AC2: a new delivery fee applies to new orders only", () => {
  test("fee 250: the next delivery order gets Rs 250, an earlier order keeps Rs 200", async () => {
    const before = await placeTestOrder(database, { quantity: 1, overrides: { ...DELIVERY_ORDER, displayedTotalRs: "1050" } });

    expect(await save({ deliveryFeeRs: "250" })).toMatchObject({ ok: true, version: 2 });
    const after = await placeTestOrder(database, { quantity: 1, overrides: { ...DELIVERY_ORDER, displayedTotalRs: "1100" } });

    const fees = await database.client.query<{ tracking_token: string; delivery_fee_rs: number; total_rs: number }>("select tracking_token, delivery_fee_rs, total_rs from orders");
    const fee = (token: string) => fees.rows.find((r) => r.tracking_token === token);
    expect(fee(before.token)).toMatchObject({ delivery_fee_rs: 200, total_rs: 1050 });
    expect(fee(after.token)).toMatchObject({ delivery_fee_rs: 250, total_rs: 1100 });
  });
});

describe("S-058 AC3, AC4: checkout, footer and tracking show a change on the next request", () => {
  test("a new pickup address and Juice number reach checkout and the footer at once", async () => {
    await getSiteSettings(db()); // warm the per-isolate cache with the old values

    await save({ pickupAddress: "12 Royal Road, Beau Bassin", juiceNumber: "5999 1234" });

    const basket = await basketLoader(routeArgs(database, { path: "/basket" }) as never);
    expect(basket.menu.data.checkout.pickup.address).toBe("12 Royal Road, Beau Bassin");
    expect(basket.menu.data.checkout.payment.juiceNumber).toBe("5999 1234");
    expect((await getSiteSettings(db())).footer.pickupAddress).toBe("12 Royal Road, Beau Bassin");
  });

  test("the tracking page shows the new Juice number", async () => {
    const { token } = await placeTestOrder(database);

    await save({ juiceNumber: "5999 1234" });

    const page = (await trackingLoader(routeArgs(database, { path: `/t/${token}`, params: { token } }) as never)) as { payment: { juiceNumber: string | null } };
    expect(page.payment.juiceNumber).toBe("5999 1234");
  });
});

describe("S-058 AC6: a new order number prefix is for new orders only", () => {
  test("an order placed before keeps APB-0001 on tracking and in the admin list; the next is CK-0002", async () => {
    const first = await placeTestOrder(database);

    await save({ orderNumberPrefix: "CK-" });
    const second = await placeTestOrder(database);

    const number = async (token: string) => ((await trackingLoader(routeArgs(database, { path: `/t/${token}`, params: { token } }) as never)) as { order: { number: string } }).order.number;
    expect(await number(first.token)).toBe("APB-0001");
    expect(await number(second.token)).toBe("CK-0002");
    const session = await owner();
    const list = await ordersLoader(routeArgs(database, { path: "/admin/orders?tab=review", auth: session.auth, cookie: session.cookie }) as never);
    expect(list.data.map((o: { number: string }) => o.number)).toEqual(["APB-0001", "CK-0002"]);
  });
});

describe("S-059 AC1: content is stored and returned as { en, fr }", () => {
  test("tagline, About, FAQ, policies and privacy note in both languages; English-only falls back on French pages", async () => {
    const answer = await save({
      "heroTagline.en": "Cakes for little joys",
      "heroTagline.fr": "Des gâteaux pour les petits bonheurs",
      "about.en": "We bake in Beau Bassin.\nEvery cake to order.",
      "about.fr": "",
      "faq.en": "Do you deliver?\nYes, island-wide.",
      "faq.fr": "Livrez-vous ?\nOui, partout.",
      "policies.en": "Cancellation: 48 hours before. Storage: keep cool.",
      "policies.fr": "Annulation : 48 heures avant. Conservation : au frais.",
      "privacyNote.en": "We only use your details for your order.",
    });
    expect(answer).toMatchObject({ ok: true, warnings: { policies: false } });

    const session = await owner();
    const page = await loader(routeArgs(database, { path: "/admin/settings", auth: session.auth, cookie: session.cookie }) as never);
    expect(page.settings.heroTagline).toEqual({ en: "Cakes for little joys", fr: "Des gâteaux pour les petits bonheurs" });
    expect(page.settings.about).toEqual({ en: "We bake in Beau Bassin.\nEvery cake to order." });
    expect(page.settings.faq).toEqual({ en: "Do you deliver?\nYes, island-wide.", fr: "Livrez-vous ?\nOui, partout." });
    expect(localized(page.settings.about!, "fr")).toBe("We bake in Beau Bassin.\nEvery cake to order.");
    expect(localized(page.settings.privacyNote!, "fr")).toBe("We only use your details for your order.");
  });
});

describe("S-059 AC5: featured products", () => {
  test("hidden and sold-out products are listed with their status so the page can flag them", async () => {
    const hidden = await insertProduct(database.db, { slug: "secret", nameEn: "Secret cake", status: "hidden" });
    const soldOut = await insertProduct(database.db, { slug: "gone", nameEn: "Gone cake", status: "sold_out" });

    expect(await save({ featuredProductIds: [hidden, soldOut] })).toMatchObject({ ok: true });

    const session = await owner();
    const page = await loader(routeArgs(database, { path: "/admin/settings", auth: session.auth, cookie: session.cookie }) as never);
    expect(page.settings.featuredProductIds).toEqual([hidden, soldOut]);
    expect(page.products.filter((p) => p.id === hidden || p.id === soldOut).map((p) => p.status).sort()).toEqual(["hidden", "sold_out"]);
  });

  test("a seventh is refused and nothing is saved", async () => {
    const ids = await Promise.all(Array.from({ length: 7 }, (_, i) => insertProduct(database.db, { slug: `cake-${i}` })));

    const refused = (await save({ featuredProductIds: ids })) as Refusal;

    expect(refused.init.status).toBe(400);
    expect(refused.data.error.fields).toEqual({ featuredProductIds: "Choose 6 featured products at most." });
    expect((await database.client.query("select featured_product_ids, version from settings")).rows).toEqual([{ featured_product_ids: [], version: 1 }]);
  });
});
