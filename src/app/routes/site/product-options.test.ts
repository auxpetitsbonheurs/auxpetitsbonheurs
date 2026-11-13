// S-066 (options, live price, add to basket) and S-067 (message on cake): the product loader
// and the addToBasket action. Server rules = domain/pricing (S-081); no client price is read.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { optionChoice, optionGroup, settings } from "~/db/schema";
import { insertProduct } from "~/db/testing/catalogue";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { decodeBasket } from "~/domain/basket-cookie";
import { priceBasketFromMenu } from "~/domain/menu-pricing";
import { BASKET_COOKIE } from "~/server/basket.server";
import { loadMenu } from "~/server/menu.server";
import { TEST_SUPABASE_URL, cookieFrom, routeArgs } from "~/server/testing/route-context";
import { eq } from "drizzle-orm";
import { action, loader } from "./product";

let database: TestDatabase;
let cakeId: string;
let size: string;
let six: string;
let eight: string;
let addons: string;
let candles: string;
let name: string;

beforeEach(async () => {
  database = await createTestDatabase();
  cakeId = await insertProduct(database.db, { basePriceRs: 1200 });
  const group = async (values: Omit<typeof optionGroup.$inferInsert, "productId">) => (await database.db.insert(optionGroup).values({ productId: cakeId, ...values }).returning({ id: optionGroup.id }))[0]!.id;
  const choice = async (groupId: string, nameEn: string, priceDeltaRs: number, sortOrder: number) =>
    (await database.db.insert(optionChoice).values({ groupId, nameEn, priceDeltaRs, sortOrder }).returning({ id: optionChoice.id }))[0]!.id;
  size = await group({ nameEn: "Size", nameFr: "Taille", kind: "single", required: true, sortOrder: 0 });
  six = await choice(size, "6 inch", 0, 0);
  eight = await choice(size, "8 inch", 600, 1);
  addons = await group({ nameEn: "Add-ons", kind: "multiple", sortOrder: 1 });
  candles = await choice(addons, "Candles", 150, 0);
  name = await group({ nameEn: "Name", kind: "text", textMaxLength: 20, sortOrder: 2 });
}, 60_000);

afterEach(async () => {
  await database.close();
});

type Form = Record<string, string | string[]>;
type Refusal = { data: { ok: false; error: { code: string; fields?: Record<string, string> } }; init: { status: number; headers?: unknown } };

function add(form: Form, cookie?: string, path = "/menu/chocolate-cake") {
  return action(routeArgs(database, { path, params: { slug: "chocolate-cake" }, cookie, form: { intent: "addToBasket", productId: cakeId, quantity: "1", ...form } as Record<string, string> }) as never);
}

const eightInch = (): Form => ({ [`option.${size}`]: eight });

async function basketAfter(response: unknown) {
  const cookie = cookieFrom((response as Response).headers.get("Set-Cookie"));
  return { cookie, lines: decodeBasket(cookie.slice(BASKET_COOKIE.length + 1)) };
}

describe("loader (S-066 AC1, S-067 AC6)", () => {
  test("returns the option groups with their choices and deltas, and the Settings message limit", async () => {
    const data = await loader(routeArgs(database, { path: "/menu/chocolate-cake", params: { slug: "chocolate-cake" } }) as never);

    expect(data.cakeMessageMax).toBe(40);
    expect(data.product.optionGroups.map((g) => [g.name.en, g.kind, g.required])).toEqual([["Size", "single", true], ["Add-ons", "multiple", false], ["Name", "text", false]]);
    expect(data.product.optionGroups[0]!.choices.map((c) => [c.name.en, c.priceDeltaRs])).toEqual([["6 inch", 0], ["8 inch", 600]]);
  });

  test("the Owner sets the message limit to 60: the next load uses 60", async () => {
    await database.db.update(settings).set({ cakeMessageMax: 60 }).where(eq(settings.id, 1));

    const data = await loader(routeArgs(database, { path: "/menu/chocolate-cake", params: { slug: "chocolate-cake" } }) as never);

    expect(data.cakeMessageMax).toBe(60);
  });
});

describe("addToBasket with options (S-066)", () => {
  test("AC2: the stored line has the chosen options, and the basket prices it with them (Rs 1,950)", async () => {
    const response = await add({ ...eightInch(), [`option.${addons}`]: candles, [`optionText.${name}`]: "  Zoé ", cakeMessage: "Happy birthday" });
    const { lines } = await basketAfter(response);

    expect(lines).toEqual([{ lineId: expect.any(String), productId: cakeId, options: [{ groupId: size, choiceIds: [eight] }, { groupId: addons, choiceIds: [candles] }, { groupId: name, choiceIds: [], text: "Zoé" }], cakeMessage: "Happy birthday", quantity: 1 }]);
    const menu = await loadMenu({ db: database.db, supabaseUrl: TEST_SUPABASE_URL, now: new Date("2026-11-10T08:00:00Z") });
    expect(priceBasketFromMenu(lines, menu.data)[0]).toMatchObject({ unitPriceRs: 1950, lineTotalRs: 1950, problem: null });
  });

  test("AC6: the same configuration twice is one line of 2; another size or message is a new line", async () => {
    let { cookie } = await basketAfter(await add(eightInch()));
    ({ cookie } = await basketAfter(await add(eightInch(), cookie)));
    ({ cookie } = await basketAfter(await add({ [`option.${size}`]: six }, cookie)));
    const { lines } = await basketAfter(await add({ ...eightInch(), cakeMessage: "Joyeux anniversaire" }, cookie));

    expect(lines.map((l) => [l.options[0]!.choiceIds[0], l.cakeMessage ?? null, l.quantity])).toEqual([[eight, null, 2], [six, null, 1], [eight, "Joyeux anniversaire", 1]]);
  });

  test("AC6: merging caps the line at 50", async () => {
    const { cookie } = await basketAfter(await add({ ...eightInch(), quantity: "45" }));
    const { lines } = await basketAfter(await add({ ...eightInch(), quantity: "10" }, cookie));

    expect(lines[0]?.quantity).toBe(50);
  });

  test("AC7: with 10 lines a new configuration is BASKET_FULL; the same one still merges", async () => {
    let cookie: string | undefined;
    for (let i = 0; i < 10; i += 1) ({ cookie } = await basketAfter(await add({ ...eightInch(), cakeMessage: `Cake ${i}` }, cookie)));

    const refused = (await add({ [`option.${size}`]: six }, cookie)) as unknown as Refusal;
    expect([refused.init.status, refused.data.error.code]).toEqual([422, "BASKET_FULL"]);
    const merged = await basketAfter(await add({ ...eightInch(), cakeMessage: "Cake 3" }, cookie));
    expect(merged.lines[3]?.quantity).toBe(2);
  });

  test("AC8: a forged post lists every issue in fields and adds nothing; a posted price is ignored", async () => {
    const refused = (await add({ [`option.${addons}`]: eight, [`optionText.${name}`]: "x".repeat(21), unitPriceRs: "1", totalRs: "1" })) as unknown as Refusal;

    expect(refused.init.status).toBe(400);
    expect(refused.data.error.code).toBe("VALIDATION_FAILED");
    expect(refused.data.error.fields).toMatchObject({
      [`options.${addons}`]: "This choice is no longer offered. Please choose again.",
      [`options.${name}`]: "Too long: up to 20 characters.",
      [`options.${size}`]: "Choose a size",
    });
    expect(refused.init.headers).toBeUndefined();
  });

  test("AC8: quantity 0, 51 or 1.5 is VALIDATION_FAILED on quantity", async () => {
    for (const quantity of ["0", "51", "1.5"]) {
      const refused = (await add({ ...eightInch(), quantity })) as unknown as Refusal;
      expect(refused.data.error.fields?.quantity).toBe("Choose a quantity from 1 to 50.");
    }
  });

  test("AC8: in French the messages are French", async () => {
    const refused = (await add({}, undefined, "/fr/menu/chocolate-cake")) as unknown as Refusal;

    expect(refused.data.error.fields?.[`options.${size}`]).toBe("Veuillez choisir : Taille");
  });

  test("AC9: a product hidden, sold out or out of season since the page loaded is PRODUCT_UNAVAILABLE", async () => {
    for (const change of ["status = 'hidden'", "status = 'sold_out'", "status = 'available', seasonal_starts_on = '2026-12-01', seasonal_ends_on = '2026-12-25'"]) {
      await database.client.query(`update product set ${change} where id = $1`, [cakeId]);
      const refused = (await add(eightInch())) as unknown as Refusal;
      expect([refused.init.status, refused.data.error.code]).toEqual([409, "PRODUCT_UNAVAILABLE"]);
    }
  });

  test("AC10: with a minimum of 6, quantity 5 is refused on quantity; with none, 1 is fine", async () => {
    expect(((await add(eightInch())) as Response).status).toBe(302);
    await database.client.query("update product set min_quantity = 6 where id = $1", [cakeId]);

    const refused = (await add({ ...eightInch(), quantity: "5" })) as unknown as Refusal;
    expect(refused.data.error.fields?.quantity).toBe("The smallest quantity for this item is 6.");
    expect(((await add({ ...eightInch(), quantity: "6" })) as Response).status).toBe(302);
  });
});

describe("message on cake (S-067)", () => {
  test("AC2: 41 characters is VALIDATION_FAILED on cakeMessage; nothing is truncated or stored", async () => {
    const refused = (await add({ ...eightInch(), cakeMessage: "a".repeat(41) })) as unknown as Refusal;

    expect(refused.data.error.fields?.cakeMessage).toBe("Too long: up to 40 characters.");
    expect(refused.init.headers).toBeUndefined();
  });

  test("AC3: exactly 40 characters, or 40 emoji, is accepted as typed", async () => {
    const { lines } = await basketAfter(await add({ ...eightInch(), cakeMessage: "🎂".repeat(40) }));

    expect(lines[0]?.cakeMessage).toBe("🎂".repeat(40));
  });

  test("AC4: a message of spaces only is no message", async () => {
    const { lines } = await basketAfter(await add({ ...eightInch(), cakeMessage: "     " }));

    expect(lines[0]).not.toHaveProperty("cakeMessage");
  });

  test("AC6: with the limit at 60, 60 characters are accepted", async () => {
    await database.db.update(settings).set({ cakeMessageMax: 60 }).where(eq(settings.id, 1));

    expect(((await add({ ...eightInch(), cakeMessage: "b".repeat(60) })) as Response).status).toBe(302);
  });
});
