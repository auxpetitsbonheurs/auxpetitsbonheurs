// ADR-0004: client-side basket and cached menu. Add, quantity and remove make no network
// call; the menu cached in the phone renders the basket without a round trip; stale items
// are handled calmly (price-updated note, unavailable line dimmed and left out), and the
// no-JavaScript form posts still work.
import { chooseDate } from "./support/checkout-date";
import { expectKeyboardOperable, expectNoA11yViolations, expectNoHorizontalScroll, expectNothingClipped, expectTapTargets, withZoom } from "./support/a11y";
import { setClock } from "./support/clock";
import { SAMPLE_PRODUCT } from "./support/database";
import { type Page, expect, test } from "./support/fixtures";
import type postgres from "postgres";

const CAKE_PATH = `/menu/${SAMPLE_PRODUCT.slug}`;
const MENU_KEY = "apb_menu";

async function hydrated(page: Page) {
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
}

/** Waits until the menu is cached in the page's localStorage (the layout warms it after load). */
async function menuCached(page: Page) {
  await page.waitForFunction((key) => window.localStorage.getItem(key) !== null, MENU_KEY);
}

/** A product of this test alone (so price and status changes touch no other test). */
async function freshProduct(db: postgres.Sql, name: string, priceRs: number) {
  const slug = `${name.toLowerCase().replace(/\W+/g, "-")}-${test.info().parallelIndex}-${Date.now()}`;
  const [row] = await db<{ id: string }[]>`
    insert into product (slug, type, name_en, name_fr, base_price_rs)
    values (${slug}, 'dessert', ${name}, ${`${name} (fr)`}, ${priceRs}) returning id`;
  return { id: row!.id, slug, name };
}

/** Requests the page sends while `action` runs (static assets excluded). */
async function requestsDuring(page: Page, action: () => Promise<void>) {
  const seen: string[] = [];
  const record = (request: { url(): string; method(): string }) => {
    if (!/\/assets\/|\.(svg|png|webp|woff2?)$/.test(request.url())) seen.push(`${request.method()} ${new URL(request.url()).pathname}`);
  };
  page.on("request", record);
  await action();
  page.off("request", record);
  return seen;
}

async function addFromProductPage(page: Page, path: string) {
  await page.goto(path);
  await hydrated(page);
  await menuCached(page);
  await page.getByRole("button", { name: /Add to basket|Ajouter au panier/ }).click();
  await expect(page.getByRole("status").filter({ hasText: /Added to your basket|Ajouté à votre panier/ })).toBeVisible();
}

/**
 * Edits the cached menu as an older copy would be: `productId` at `priceRs`, an old version.
 * Waits for hydration first: the page's own loader copy is written to the cache by then.
 */
async function ageCachedPrice(page: Page, productId: string, priceRs: number) {
  await hydrated(page);
  await menuCached(page);
  await page.evaluate(
    ({ key, productId, priceRs }) => {
      const stored = JSON.parse(window.localStorage.getItem(key)!) as { v: string; data: { generatedAt: number; products: { id: string; basePriceRs: number }[] } };
      stored.v = "m-older";
      stored.data.generatedAt -= 60_000;
      for (const p of stored.data.products) if (p.id === productId) p.basePriceRs = priceRs;
      window.localStorage.setItem(key, JSON.stringify(stored));
    },
    { key: MENU_KEY, productId, priceRs },
  );
}

async function expectAccessibleLayout(page: Page) {
  for (const zoom of [1, 2]) {
    await withZoom(page, zoom, async () => {
      await expectNoHorizontalScroll(page);
      await expectNothingClipped(page);
      await expectTapTargets(page);
      await expectKeyboardOperable(page);
    });
  }
}

test.describe("ADR-0004 instant Add to basket", () => {
  test("with JavaScript, Add makes no network request; the count and the confirmation update at once", async ({ page }) => {
    await page.goto(CAKE_PATH);
    await hydrated(page);
    await menuCached(page);

    const requests = await requestsDuring(page, async () => {
      await page.getByRole("button", { name: "Add to basket" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Added to your basket" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Basket, 1 item" })).toBeVisible();
    });

    expect(requests).toEqual([]);
    await expect(page.getByRole("status").filter({ hasText: "1 item in basket" })).toBeAttached();
    const cookie = (await page.context().cookies()).find((c) => c.name === "apb_basket");
    expect(cookie).toMatchObject({ httpOnly: false, sameSite: "Lax", secure: true });
    // Exactly the line fields, never a price (checked on the keys: a random line id may contain "rs").
    const lines = JSON.parse(decodeURIComponent(cookie!.value)) as Record<string, unknown>[];
    expect(lines.map((line) => Object.keys(line).sort())).toEqual([["lineId", "options", "productId", "quantity"]]);
  });

  test("a double tap adds once and keeps focus on the button", async ({ page }) => {
    await page.goto(CAKE_PATH);
    await hydrated(page);
    await menuCached(page);
    const button = page.getByRole("button", { name: "Add to basket" });
    await button.focus();

    const requests = await requestsDuring(page, async () => {
      await button.dblclick();
      await expect(page.getByRole("status").filter({ hasText: "Added to your basket" })).toBeVisible();
    });

    expect(requests).toEqual([]);
    await expect(button).toBeFocused();
    await expect(page.getByRole("link", { name: "Basket, 1 item" })).toBeVisible();
  });

  test("AC46: a deliberate second Add says how many are now in the basket", async ({ page }) => {
    await addFromProductPage(page, CAKE_PATH);
    // A deliberate second tap comes after the 800 ms double-tap guard.
    const firstTap = await page.evaluate(() => performance.now());
    await page.waitForFunction((at) => performance.now() - at > 850, firstTap);

    await page.getByRole("button", { name: "Add to basket" }).click();

    await expect(page.getByRole("status").filter({ hasText: "Added to your basket (2 in basket)" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Basket, 2 items" })).toBeVisible();
  });

  test("AC44: Remove says what was removed and Undo puts the same line back, with no network request", async ({ page }) => {
    await addFromProductPage(page, CAKE_PATH);
    await page.goto("/basket");
    await hydrated(page);
    await menuCached(page);
    await page.getByRole("button", { name: `Increase quantity of ${SAMPLE_PRODUCT.nameEn}` }).click();

    const requests = await requestsDuring(page, async () => {
      await page.getByRole("button", { name: `Remove ${SAMPLE_PRODUCT.nameEn} from basket` }).click();
      const removed = page.getByRole("status").filter({ hasText: `Removed from your basket: ${SAMPLE_PRODUCT.nameEn}.` });
      await expect(removed).toBeVisible();
      await expect(page.getByText("Your basket is empty.")).toBeVisible();
      await expectNoA11yViolations(page);
      await removed.getByRole("button", { name: `Undo removing ${SAMPLE_PRODUCT.nameEn}` }).click();
    });

    expect(requests).toEqual([]);
    await expect(page.getByRole("status").filter({ hasText: `Back in your basket: ${SAMPLE_PRODUCT.nameEn}.` })).toBeVisible();
    await expect(page.getByRole("group", { name: `Quantity of ${SAMPLE_PRODUCT.nameEn}` }).locator("output")).toHaveText("2");
    await expect(page.getByRole("link", { name: "Basket, 2 items" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "1. Basket" })).toBeFocused();
    await page.reload();
    await expect(page.getByRole("group", { name: `Quantity of ${SAMPLE_PRODUCT.nameEn}` }).locator("output")).toHaveText("2");
  });

  test("the server reads the browser-written basket: the basket page shows the line", async ({ page }) => {
    await addFromProductPage(page, CAKE_PATH);
    await page.goto("/basket");

    await expect(page.getByRole("group", { name: `Quantity of ${SAMPLE_PRODUCT.nameEn}` }).locator("output")).toHaveText("1");
    await expect(page.getByRole("link", { name: "Basket, 1 item" })).toBeVisible();
  });

  test("quantity and Remove change the basket with no network request, and focus stays in the basket", async ({ page }) => {
    await addFromProductPage(page, CAKE_PATH);
    await page.goto("/basket");
    await hydrated(page);
    await menuCached(page);
    const quantity = page.getByRole("group", { name: `Quantity of ${SAMPLE_PRODUCT.nameEn}` }).locator("output");

    const requests = await requestsDuring(page, async () => {
      await page.getByRole("button", { name: `Increase quantity of ${SAMPLE_PRODUCT.nameEn}` }).click();
      await expect(quantity).toHaveText("2");
      await expect(page.getByRole("link", { name: "Basket, 2 items" })).toBeVisible();
      await expect(page.locator("[data-sticky-bar]").getByText("Rs 1,700").locator("visible=true")).toHaveCount(1);
      await page.getByRole("button", { name: `Remove ${SAMPLE_PRODUCT.nameEn} from basket` }).click();
      await expect(page.getByText("Your basket is empty.")).toBeVisible();
    });

    expect(requests).toEqual([]);
    await expect(page.getByRole("link", { name: "Basket, 0 items" })).toBeVisible();
    await expect(page.locator("#main")).toBeFocused();
    await page.reload();
    await expect(page.getByText("Your basket is empty.")).toBeVisible();
  });

  test("a basket cookie from before ADR-0004 (HttpOnly) is converted once, then Add is instant", async ({ page, baseURL }) => {
    const line = { lineId: "old", productId: "00000000-0000-4000-8000-000000000000", options: [], quantity: 1 };
    await page.context().addCookies([{ name: "apb_basket", value: encodeURIComponent(JSON.stringify([line])), url: baseURL!, httpOnly: true, secure: true, sameSite: "Lax" }]);
    const reissued = page.waitForResponse((r) => r.url().endsWith("/api/basket/reissue"));
    await page.goto(CAKE_PATH);
    expect((await reissued).status()).toBe(204);
    await expect.poll(async () => (await page.context().cookies()).find((c) => c.name === "apb_basket")?.httpOnly).toBe(false);
    await hydrated(page);
    await menuCached(page);

    const requests = await requestsDuring(page, async () => {
      await page.getByRole("button", { name: "Add to basket" }).click();
      await expect(page.getByRole("link", { name: "Basket, 2 items" })).toBeVisible();
    });
    expect(requests).toEqual([]);
  });

  test("when the cookie cannot be written from script, Add falls back to the server post (Adding… then Added)", async ({ page, baseURL }) => {
    const line = { lineId: "old", productId: "00000000-0000-4000-8000-000000000000", options: [], quantity: 1 };
    await page.context().addCookies([{ name: "apb_basket", value: encodeURIComponent(JSON.stringify([line])), url: baseURL!, httpOnly: true, secure: true, sameSite: "Lax" }]);
    await page.route("**/api/basket/reissue", (route) => route.abort());
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let posts = 0;
    await page.route(/\/menu\/[^/]+(\.data)?(\?.*)?$/, async (route) => {
      if (route.request().method() === "POST") {
        posts += 1;
        await held;
      }
      await route.continue();
    });
    await page.goto(CAKE_PATH);
    await hydrated(page);

    const button = page.getByRole("button", { name: "Add to basket" });
    await button.focus();
    await button.click();
    const busy = page.getByRole("button", { name: "Adding…" });
    await expect(busy).toHaveAttribute("aria-busy", "true");
    await expect(busy).toBeFocused();
    release();

    await expect(page.getByRole("status").filter({ hasText: "Added to your basket" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Basket, 2 items" })).toBeVisible();
    expect(posts).toBe(1);
  });
});

test.describe("ADR-0004 menu cached in the phone", () => {
  test("GET /api/menu answers with an ETag, public caching, and 304 for the same version", async ({ request }) => {
    const first = await request.get("/api/menu");
    expect(first.status()).toBe(200);
    expect(first.headers()["cache-control"]).toMatch(/^public, max-age=60, stale-while-revalidate=\d+$/);
    const etag = first.headers().etag!;
    const body = (await first.json()) as { v: string; data: { products: { id: string }[]; checkout: Record<string, unknown> } };
    expect(etag).toBe(`"${body.v}"`);
    expect(body.data.checkout).not.toHaveProperty("orderNumberPrefix");

    const again = await request.get("/api/menu", { headers: { "If-None-Match": etag } });
    expect(again.status()).toBe(304);
  });

  test("the basket's code is loaded ahead from the header link, with no data prefetch", async ({ page }) => {
    const requests = await requestsDuring(page, async () => {
      await page.goto(CAKE_PATH);
      await hydrated(page);
      await expect(page.locator('link[rel="modulepreload"][href*="basket"]')).not.toHaveCount(0);
      await menuCached(page);
    });
    expect(requests.filter((r) => r.includes(".data"))).toEqual([]);
  });

  test("a repeat visit renders the basket from the cached menu with no loader request", async ({ page }) => {
    await addFromProductPage(page, CAKE_PATH);

    const requests = await requestsDuring(page, async () => {
      await page.getByRole("link", { name: "View basket" }).click();
      await expect(page).toHaveURL(/\/basket$/);
      await expect(page.getByRole("group", { name: `Quantity of ${SAMPLE_PRODUCT.nameEn}` }).locator("output")).toHaveText("1");
      await expect(page.getByRole("heading", { level: 2, name: "1. Basket" })).toBeVisible();
    });

    expect(requests.filter((r) => r.includes(".data"))).toEqual([]);
    expect(requests.every((r) => r === "GET /api/menu")).toBe(true);
    await expect(page.getByRole("link", { name: "Français" })).toHaveAttribute("href", "/fr/basket");
    await expect(page).toHaveTitle("Your basket | Aux petits bonheurs");
  });

  test("a changed price shows one calm note on the line, announced politely; totals are current and checkout stays enabled", async ({ page, db }) => {
    const tart = await freshProduct(db, "Lemon tart", 400);
    await addFromProductPage(page, `/menu/${tart.slug}`);
    await page.goto("/basket");
    await menuCached(page);
    await ageCachedPrice(page, tart.id, 350);

    await page.reload();

    const note = page.getByText("Price updated from Rs 350 to Rs 400");
    await expect(note).toBeVisible();
    await expect(note.locator("xpath=ancestor::*[@aria-live='polite'][1]")).toHaveCount(1);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByText("Subtotal").locator("..")).toContainText("Rs 400");
    await expect(page.getByRole("button", { name: "Place order" })).toBeEnabled();
    await expectAccessibleLayout(page);
    await expectNoA11yViolations(page);
  });

  test("a price changed while the basket was open from the cache is picked up in the background", async ({ page, db }) => {
    const tart = await freshProduct(db, "Plum tart", 300);
    await addFromProductPage(page, `/menu/${tart.slug}`);
    await db`update product set base_price_rs = 360 where id = ${tart.id}`;

    await page.getByRole("link", { name: "View basket" }).click();

    await expect(page.getByText("Price updated from Rs 300 to Rs 360")).toBeVisible();
    await expect(page.locator("[data-sticky-bar]").getByText("Rs 360").locator("visible=true")).toHaveCount(1);
  });

  test("French: the price note and the unavailable note are in French", async ({ page, db }) => {
    const tart = await freshProduct(db, "Fig tart", 500);
    const gone = await freshProduct(db, "Pear tart", 200);
    await addFromProductPage(page, `/fr/menu/${tart.slug}`);
    await addFromProductPage(page, `/fr/menu/${gone.slug}`);
    await page.goto("/fr/basket");
    await menuCached(page);
    await ageCachedPrice(page, tart.id, 450);
    await db`update product set status = 'sold_out' where id = ${gone.id}`;

    await page.reload();

    await expect(page.getByText("Le prix est passé de Rs 450 à Rs 500")).toBeVisible();
    await expect(page.getByText("Plus disponible. Cet article ne fera pas partie de votre commande.")).toBeVisible();
    await expect(page.getByText(`${gone.name} (fr) : non inclus, plus disponible`)).toBeVisible();
    await expect(page.getByRole("button", { name: `Retirer ${gone.name} (fr) du panier` })).toBeVisible();
  });
});

test.describe("ADR-0004 unavailable lines", () => {
  test("a sold-out line stays visible, dimmed, says No longer available, is left out of the total; checkout stays enabled", async ({ page, db }) => {
    const gone = await freshProduct(db, "Mango tart", 300);
    await addFromProductPage(page, CAKE_PATH);
    await addFromProductPage(page, `/menu/${gone.slug}`);
    await db`update product set status = 'sold_out' where id = ${gone.id}`;

    await page.goto("/basket");

    const line = page.locator("li[data-unavailable]");
    await expect(line).toContainText("Mango tart");
    await expect(line).toContainText("No longer available. It will not be part of your order.");
    await expect(line.getByRole("button", { name: "Remove Mango tart from basket" })).toBeVisible();
    await expect(line.getByRole("group")).toHaveCount(0);
    await expect(page.getByText("Subtotal").locator("..")).toContainText("Rs 850");
    await expect(page.getByRole("button", { name: "Place order" })).toBeVisible();
    // UX audit H1: the summary says it is not included; the header counts only what will be ordered (M1).
    await expect(page.locator("[data-left-out]")).toHaveText("Mango tart: not included, no longer available");
    await expect(page.getByRole("link", { name: "Basket, 1 item" })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "1 item is no longer available" })).toBeAttached();
    await expectAccessibleLayout(page);
    for (const colorScheme of ["light", "dark"] as const) {
      // Before a load, as the other specs do: switching after load would scan mid-transition.
      await page.emulateMedia({ colorScheme });
      await page.reload();
      await expect(line).toContainText("No longer available");
      await expectNoA11yViolations(page);
    }
  });

  test("AC42: a hidden product's line keeps its name; with nothing orderable left, its own message and See the menu replace checkout", async ({ page, db }) => {
    const gone = await freshProduct(db, "Guava tart", 300);
    await addFromProductPage(page, `/menu/${gone.slug}`);
    await db`update product set status = 'hidden' where id = ${gone.id}`;

    await page.goto("/basket");
    await hydrated(page);

    await expect(page.locator("li[data-unavailable]")).toContainText("Guava tart");
    await expect(page.getByText("Nothing in your basket can be ordered right now. Remove the unavailable items or choose something else.")).toBeVisible();
    await expect(page.getByRole("link", { name: "See the menu" })).toBeVisible();
    await expect(page.getByText("Your basket is empty.")).toHaveCount(0);
    await expect(page.getByText("Subtotal")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Place order" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Basket, 0 items" })).toBeVisible();
    await expectAccessibleLayout(page);
    await expectNoA11yViolations(page);

    await page.getByRole("button", { name: "Remove Guava tart from basket" }).click();
    await expect(page.locator("main li")).toHaveCount(0);
    await expect(page.getByText("Your basket is empty.")).toBeVisible();
  });

  test("AC42: when everything sold out after the page loaded, the refusal says nothing can be ordered, not that the basket is empty", async ({ page, db, context, baseURL }) => {
    await setClock(context, baseURL!, "2026-11-20T06:00:00Z");
    const tart = await freshProduct(db, "Quince tart", 300);
    await addFromProductPage(page, `/menu/${tart.slug}`);
    await page.goto("/basket");
    await hydrated(page);
    await fillPickup(page);
    await db`update product set status = 'sold_out' where id = ${tart.id}`;

    await page.getByRole("button", { name: "Place order" }).click();

    await expect(page.getByText("Nothing in your basket can be ordered right now. Remove the unavailable items or choose something else.").first()).toBeVisible();
    await expect(page.getByText("Your basket is empty.")).toHaveCount(0);
    await expect(page.locator("li[data-unavailable]")).toContainText("Quince tart");
  });

  test("AC40: an item sold out after the page loaded is named at Place order: not sent yet, left out, new total; then the order shows it was not included (AC41)", async ({ page, db, context, baseURL }) => {
    await setClock(context, baseURL!, "2026-11-20T06:00:00Z");
    const gone = await freshProduct(db, "Cherry tart", 300);
    await addFromProductPage(page, CAKE_PATH);
    await addFromProductPage(page, `/menu/${gone.slug}`);
    await page.goto("/basket");
    await hydrated(page);
    await fillPickup(page);
    await db`update product set status = 'sold_out' where id = ${gone.id}`;

    const button = page.getByRole("button", { name: "Place order" });
    await button.click();

    const note = page.getByRole("status").filter({ hasText: "Your order has not been sent yet" });
    await expect(note).toContainText("This item is no longer available and was left out: Cherry tart.");
    await expect(note).toContainText("The total changed from Rs 1,150 to Rs 850.");
    await expect(note).toBeInViewport();
    const again = page.getByRole("button", { name: "Place order at Rs 850" });
    await expect(again).toBeFocused();
    await expect(page.locator("li[data-unavailable]")).toContainText("No longer available. It will not be part of your order.");
    await expect(page.locator("[data-left-out]")).toHaveText("Cherry tart: not included, no longer available");
    await expectNoA11yViolations(page);

    await again.click();

    await expect(page).toHaveURL(/\/order\/[A-Za-z0-9_-]{43}\/confirmed$/);
    expect(page.url()).not.toMatch(/[?#]/);
    const leftOut = page.locator("main").getByText("Not included in your order");
    await expect(leftOut).toBeVisible();
    await expect(page.getByText("Cherry tart was no longer available when you ordered.")).toBeVisible();
    await expectNoA11yViolations(page);
    await page.reload();
    await expect(page.getByText("Cherry tart was no longer available when you ordered.")).toBeVisible();
  });

  test("placing the order leaves the unavailable line out of the order", async ({ page, db, context, baseURL }) => {
    await setClock(context, baseURL!, "2026-11-20T06:00:00Z");
    const gone = await freshProduct(db, "Kiwi tart", 300);
    await addFromProductPage(page, CAKE_PATH);
    await addFromProductPage(page, `/menu/${gone.slug}`);
    await db`update product set status = 'sold_out' where id = ${gone.id}`;
    await page.goto("/basket");
    await hydrated(page);
    await fillPickup(page);

    await page.getByRole("button", { name: "Place order" }).click();

    await expect(page).toHaveURL(/\/order\/[A-Za-z0-9_-]{43}\/confirmed$/);
    const token = /\/order\/([A-Za-z0-9_-]{43})\//.exec(page.url())![1]!;
    const items = await db<{ name_en: string }[]>`select i.name_en from order_item i join orders o on o.id = i.order_id where o.tracking_token = ${token}`;
    expect(items.map((i) => i.name_en)).toEqual([SAMPLE_PRODUCT.nameEn]);
    await expect(page.getByRole("link", { name: "Basket, 0 items" })).toBeVisible();
    // AC41: the confirmation names what was not included.
    await expect(page.getByText("Not included in your order")).toBeVisible();
    await expect(page.getByText("Kiwi tart was no longer available when you ordered.")).toBeVisible();
  });

  test("AC41: an order with nothing left out shows no left-out note", async ({ page, context, baseURL }) => {
    await setClock(context, baseURL!, "2026-11-20T06:00:00Z");
    await addFromProductPage(page, CAKE_PATH);
    await page.goto("/basket");
    await hydrated(page);
    await fillPickup(page);

    await page.getByRole("button", { name: "Place order" }).click();

    await expect(page).toHaveURL(/\/order\/[A-Za-z0-9_-]{43}\/confirmed$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Not included in your order")).toHaveCount(0);
  });

  test("AC45: a line that turns unavailable while the basket is open from the cache is announced politely", async ({ page, db }) => {
    await addFromProductPage(page, CAKE_PATH);
    const gone = await freshProduct(db, "Damson tart", 300);
    await addFromProductPage(page, `/menu/${gone.slug}`);
    await db`update product set status = 'sold_out' where id = ${gone.id}`;

    await page.getByRole("link", { name: "View basket" }).click();

    const note = page.locator("li[data-unavailable] [aria-live='polite']");
    await expect(note).toHaveText("Damson tart: No longer available. It will not be part of your order.");
    await expect(page.getByRole("status").filter({ hasText: "1 item is no longer available" })).toBeAttached();
    await expect(page.getByRole("link", { name: "Basket, 1 item" })).toBeVisible();
  });

  test("PRICE_CHANGED at Place order re-renders the summary with the new price and the same calm note, keeping what was typed", async ({ page, db, context, baseURL }) => {
    await setClock(context, baseURL!, "2026-11-20T06:00:00Z");
    const tart = await freshProduct(db, "Apple tart", 400);
    await addFromProductPage(page, `/menu/${tart.slug}`);
    await page.goto("/basket");
    await hydrated(page);
    await fillPickup(page);
    await db`update product set base_price_rs = 450 where id = ${tart.id}`;

    await page.getByRole("button", { name: "Place order" }).click();

    await expect(page.getByText("Price updated from Rs 400 to Rs 450")).toBeVisible();
    // UX audit M4: says the order was not sent yet, next to the button; no alarm.
    const note = page.getByRole("status").filter({ hasText: "Your order has not been sent yet" });
    await expect(note).toContainText("The total changed from Rs 400 to Rs 450. Check it, then press Place order to confirm.");
    await expect(note).not.toContainText("left out");
    await expect(note).toBeInViewport();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("E2E Guest");
    await expect(page.getByRole("radio", { name: /^Pickup/ })).toBeChecked();
    const button = page.getByRole("button", { name: "Place order at Rs 450" });
    await expect(button).toBeVisible();

    await button.click();
    await expect(page).toHaveURL(/\/order\/[A-Za-z0-9_-]{43}\/confirmed$/);
  });
});

test.describe("ADR-0004 without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("Add, quantity and the unavailable note work through form posts", async ({ page, db }) => {
    const gone = await freshProduct(db, "Lime tart", 300);
    await page.goto(`/menu/${gone.slug}`);
    await page.getByRole("button", { name: "Add to basket" }).click();
    await expect(page).toHaveURL(/\/basket$/);
    await page.goto(CAKE_PATH);
    await page.getByRole("button", { name: "Add to basket" }).click();
    await page.getByRole("button", { name: `Increase quantity of ${SAMPLE_PRODUCT.nameEn}` }).click();
    await expect(page.getByRole("link", { name: "Basket, 3 items" })).toBeVisible();
    await db`update product set status = 'sold_out' where id = ${gone.id}`;

    await page.reload();

    await expect(page.locator("li[data-unavailable]")).toContainText("No longer available");
    await expect(page.getByText("Subtotal").locator("..")).toContainText("Rs 1,700");
    await page.getByRole("button", { name: "Remove Lime tart from basket" }).click();
    await expect(page.locator("li[data-unavailable]")).toHaveCount(0);
  });
});

async function fillPickup(page: Page) {
  await page.getByRole("radio", { name: /^Pickup/ }).check();
  await chooseDate(page, "2026-11-24");
  await page.getByRole("radio", { name: /^Morning/ }).locator("visible=true").check();
  await page.getByLabel("Name", { exact: true }).fill("E2E Guest");
  await page.getByLabel("Phone", { exact: true }).fill("5712 3456");
  await page.getByLabel("Email", { exact: true }).fill(`guest-${test.info().testId}-${test.info().project.name}-${Date.now()}@e2e.test`);
  await page.getByRole("checkbox", { name: "I accept the order policies" }).check();
}
