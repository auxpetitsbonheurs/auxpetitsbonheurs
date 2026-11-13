// Order journey of the walking skeleton (E-01): product page (S-011), basket and
// delivery or pickup (S-012), placing the order (S-013).
import {
  expectKeyboardOperable,
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  expectNothingClipped,
  expectTapTargets,
  withZoom,
} from "./support/a11y";
import { mkdirSync } from "node:fs";
import { createProduct } from "./support/catalogue";
import { chooseDate } from "./support/checkout-date";
import { setClock } from "./support/clock";
import { orderFormReady } from "./support/product";
import { E2E_POLICIES, SAMPLE_PRODUCT, createOrder } from "./support/database";
import { type Page, expect, test, testIp } from "./support/fixtures";

const PRODUCT_PATH = `/menu/${SAMPLE_PRODUCT.slug}`;

/** Waits until React has hydrated, so clicks go through fetchers. */
async function hydrated(page: Page) {
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
}

/** Every layout check the a11y ACs name, at 100% and 200% zoom. */
/**
 * On the basket the date field turns into the calendar when its lazy chunk arrives; Tab
 * order is only stable after that (on a slow runner the swap can land mid-traversal).
 */
async function calendarSettled(page: Page) {
  if ((await page.locator("#date-heading").count()) > 0) await expect(page.getByRole("grid")).toBeVisible();
}

async function expectAccessibleLayout(page: Page) {
  await calendarSettled(page);
  for (const zoom of [1, 2]) {
    await withZoom(page, zoom, async () => {
      await expectNoHorizontalScroll(page);
      await expectNothingClipped(page);
      await expectTapTargets(page);
      await expectKeyboardOperable(page);
    });
  }
}

test.describe("S-011 product page", () => {
  test("AC1: name, description, Rs 850, photo with the name as alt and an Add button", async ({ page }) => {
    await page.goto(PRODUCT_PATH);

    await expect(page.getByRole("heading", { level: 1, name: SAMPLE_PRODUCT.nameEn })).toBeVisible();
    await expect(page.getByText(SAMPLE_PRODUCT.descriptionEn)).toBeVisible();
    // The price under the name, and the same price in the Add bar (S-066).
    await expect(page.getByRole("paragraph").filter({ hasText: /^Rs 850$/ })).toBeVisible();
    await expect(page.getByTestId("live-price")).toHaveText("Rs 850");
    const photo = page.getByRole("img", { name: SAMPLE_PRODUCT.nameEn });
    await expect(photo).toBeVisible();
    await expect(photo).toHaveJSProperty("complete", true);
    await expect(page.getByRole("button", { name: "Add to basket" })).toBeVisible();
  });

  test("AC2: an unknown slug answers 404 with the not-found page", async ({ page }) => {
    const response = await page.goto("/menu/no-such-cake");

    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
    await expect(page.getByRole("banner")).toBeVisible();
  });

  test("AC4: Add to basket stays on the page, confirms it and the header count shows 1", async ({ page }) => {
    await page.goto(PRODUCT_PATH);
    await orderFormReady(page);
    await page.getByRole("button", { name: "Add to basket" }).click();

    await expect(page.getByRole("status").filter({ hasText: "Added to your basket" })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${PRODUCT_PATH}$`));
    await expect(page.getByRole("link", { name: "Basket, 1 item" })).toBeVisible();
    const cookie = (await page.context().cookies()).find((c) => c.name === "apb_basket");
    // ADR-0004: written by the browser too, so not HttpOnly; never prices.
    expect(cookie).toMatchObject({ httpOnly: false, sameSite: "Lax" });

    await page.getByRole("link", { name: "View basket" }).click();
    await expect(page).toHaveURL(/\/basket$/);
    await expect(page.getByRole("heading", { level: 1, name: "Your basket" })).toBeVisible();
    // Regression: links built in loaders after a client navigation never carry the `.data` suffix.
    await expect(page.getByRole("link", { name: "Français" })).toHaveAttribute("href", "/fr/basket");
  });

  // "Adding…" (busy, focus kept) now shows only on the server fallback, and a double tap adds
  // once with no request at all: both in basket-instant.spec.ts (ADR-0004).

  test("AC4: a tap before the page is interactive still adds (plain form post to the basket)", async ({ page }) => {
    // Hold the app's JavaScript so the tap lands before hydration.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(/\/assets\/.*\.js$/, async (route) => {
      await held;
      await route.continue();
    });
    await page.goto(PRODUCT_PATH, { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).not.toHaveAttribute("data-hydrated", "true");

    await page.getByRole("button", { name: "Add to basket" }).click();
    release();

    await expect(page).toHaveURL(/\/basket$/);
    await expect(page.getByRole("link", { name: "Basket, 1 item" })).toBeVisible();
  });

  test("AC7: the French page shows the French name", async ({ page }) => {
    await page.goto(`/fr${PRODUCT_PATH}`);

    await expect(page.getByRole("heading", { level: 1, name: SAMPLE_PRODUCT.nameFr })).toBeVisible();
    await expect(page.getByRole("img", { name: SAMPLE_PRODUCT.nameFr })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ajouter au panier" })).toBeVisible();
  });

  test("AC8: keyboard order, visible focus, no clipping or sideways scroll, 44 px targets at 100% and 200%", async ({ page }) => {
    await page.goto(PRODUCT_PATH);

    await expectAccessibleLayout(page);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`AC9: axe clean in ${colorScheme} mode, photo with explicit size`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(PRODUCT_PATH);

      const photo = page.getByRole("img", { name: SAMPLE_PRODUCT.nameEn });
      await expect(photo).toHaveAttribute("width", "800");
      await expect(photo).toHaveAttribute("height", "600");
      await expectNoA11yViolations(page);
      await expectNoA11yViolations(page, { zoom: 2 });
    });
  }
});

test.describe("S-011 without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("AC4: Add to basket works as a plain form post", async ({ page }) => {
    await page.goto(PRODUCT_PATH);
    await page.getByRole("button", { name: "Add to basket" }).click();

    await expect(page).toHaveURL(/\/basket$/);
    await expect(page.getByRole("link", { name: "Basket, 1 item" })).toBeVisible();
  });
});

/** Puts the sample cake in the basket through the product page, then opens `basketPath`. */
async function basketWithCake(page: Page, basketPath = "/basket") {
  await page.goto(basketPath === "/basket" ? PRODUCT_PATH : `/fr${PRODUCT_PATH}`);
  await page.getByRole("button", { name: /Add to basket|Ajouter au panier/ }).click();
  // Hydrated: confirmed on the page; not yet hydrated: the plain post lands on the basket.
  const basketUrl = new RegExp(`${basketPath}$`);
  await expect(page.getByRole("status").filter({ hasText: /Added to your basket|Ajouté à votre panier/ }).or(page.getByRole("heading", { level: 1, name: /Your basket|Votre panier/ }))).toBeVisible();
  if (!basketUrl.test(page.url())) await page.goto(basketPath);
  await expect(page).toHaveURL(basketUrl);
}


test.describe("S-012 basket and delivery or pickup", () => {
  test("M2: the basket page, its data request and a line update are all Cache-Control: no-store", async ({ page }) => {
    const response = await page.goto("/basket");
    expect(response!.headers()["cache-control"]).toBe("no-store");
    await basketWithCake(page);

    // With JavaScript a line update makes no request (ADR-0004); its no-JavaScript post and
    // the client data request are sent here directly, with the page's cookies.
    const cookie = (await page.context().cookies()).find((c) => c.name === "apb_basket")!;
    const [line] = JSON.parse(decodeURIComponent(cookie.value)) as { lineId: string }[];
    const update = await page.request.post("/basket", { form: { intent: "updateLine", lineId: line!.lineId, quantity: "2" }, maxRedirects: 0 });
    expect(update.status()).toBe(302);
    expect(update.headers()["cache-control"]).toBe("no-store");
    const data = await page.request.get("/basket.data");
    expect(data.headers()["cache-control"]).toBe("no-store");
  });

  test("AC1: an empty basket shows the empty state and no form", async ({ page }) => {
    await page.goto("/basket");

    await expect(page.getByText("Your basket is empty.")).toBeVisible();
    await expect(page.getByRole("link", { name: "See the menu" })).toHaveAttribute("href", "/");
    await expect(page.locator("main form")).toHaveCount(0);
  });

  test("AC1: a line shows name, quantity, line price, subtotal and the numbered Basket section", async ({ page }) => {
    await basketWithCake(page);

    await expect(page.getByRole("heading", { level: 2, name: "1. Basket" })).toBeVisible();
    await expect(page.getByText(SAMPLE_PRODUCT.nameEn, { exact: true })).toBeVisible();
    await expect(page.getByRole("group", { name: `Quantity of ${SAMPLE_PRODUCT.nameEn}` }).locator("output")).toHaveText("1");
    await expect(page.getByText("Subtotal")).toBeVisible();
  });

  test("AC2: stepper and Remove are named after the product; two lines share no control name", async ({ page, db, baseURL }) => {
    const [tart] = await db<{ id: string }[]>`
      insert into product (slug, type, name_en, base_price_rs)
      values (${`tart-${test.info().parallelIndex}-${Date.now()}`}, 'dessert', 'Lemon tart', 400)
      returning id`;
    await page.context().addCookies([
      {
        name: "apb_basket",
        value: encodeURIComponent(JSON.stringify([{ lineId: "t", productId: tart!.id, options: [], quantity: 2 }])),
        url: baseURL!,
      },
    ]);
    await basketWithCake(page);

    for (const name of [SAMPLE_PRODUCT.nameEn, "Lemon tart"]) {
      await expect(page.getByRole("button", { name: `Decrease quantity of ${name}`, exact: true })).toBeAttached();
      await expect(page.getByRole("button", { name: `Increase quantity of ${name}`, exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: `Remove ${name} from basket`, exact: true })).toBeVisible();
    }
    const names = await page
      .locator("main")
      .locator("button, a")
      .evaluateAll((els) =>
        els.filter((el) => el.getClientRects().length > 0).map((el) => el.getAttribute("aria-label") ?? el.textContent?.trim() ?? ""),
      );
    expect(names.length).toBeGreaterThanOrEqual(6);
    expect(new Set(names).size, `duplicate control names: ${names.join(" | ")}`).toBe(names.length);
    await expect(page.getByRole("group", { name: "Quantity of Lemon tart" }).locator("output")).toHaveAttribute("aria-live", "polite");
  });

  test("AC3, spec AC47 (UX audit M5): at quantity 1 Decrease changes nothing; pressing it explains, tied to the button", async ({ page }) => {
    await basketWithCake(page);
    await hydrated(page);
    const decrease = page.getByRole("button", { name: `Decrease quantity of ${SAMPLE_PRODUCT.nameEn}` });
    const hint = page.getByText("1 is the smallest quantity. To take this out, press Remove.");

    await expect(decrease).toHaveAttribute("aria-disabled", "true");
    await expect(hint).toHaveCount(0);
    await decrease.focus();
    await page.keyboard.press("Enter");

    await expect(hint).toBeVisible();
    await expect(decrease).toHaveAccessibleDescription("1 is the smallest quantity. To take this out, press Remove.");
    await expect(page.getByRole("group", { name: `Quantity of ${SAMPLE_PRODUCT.nameEn}` }).locator("output")).toHaveText("1");
    await expect(decrease).toBeFocused();
  });

  test("AC4: changing the quantity and removing update totals and the header count, and survive a reload", async ({ page }) => {
    await basketWithCake(page);
    await hydrated(page);
    const quantity = page.getByRole("group", { name: `Quantity of ${SAMPLE_PRODUCT.nameEn}` }).locator("output");

    await page.getByRole("button", { name: `Increase quantity of ${SAMPLE_PRODUCT.nameEn}` }).click();
    await expect(quantity).toHaveText("2");
    await expect(page.getByRole("link", { name: "Basket, 2 items" })).toBeVisible();
    await expect(page.getByText("Rs 1,700").first()).toBeVisible();

    await page.reload();
    await expect(quantity).toHaveText("2");

    await page.getByRole("button", { name: `Remove ${SAMPLE_PRODUCT.nameEn} from basket` }).click();
    await expect(page.getByText("Your basket is empty.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Basket, 0 items" })).toBeVisible();
  });

  test("AC5, AC6: no default choice; delivery shows address, landmark and Rs 200; pickup shows Beau Bassin and free", async ({ page }) => {
    await basketWithCake(page);
    const delivery = page.getByRole("radio", { name: /Delivery/ });
    const pickup = page.getByRole("radio", { name: /Pickup/ });

    await expect(delivery).not.toBeChecked();
    await expect(pickup).not.toBeChecked();
    await expect(page.getByLabel("Delivery address")).toBeHidden();
    await expect(page.getByText("Total before delivery").first()).toBeVisible();

    await delivery.check();
    await expect(page.getByLabel("Delivery address")).toBeVisible();
    await expect(page.getByLabel(/Landmark/)).toBeVisible();
    await expect(page.getByText("Delivery fee Rs 200")).toBeVisible();
    const bar = page.locator("[data-sticky-bar]");
    await expect(bar.getByText("Total", { exact: true }).locator("visible=true")).toHaveCount(1);
    await expect(bar.getByText("Rs 1,050", { exact: true })).toBeVisible();
    await page.getByLabel("Delivery address").fill("12 Royal Road, Rose Hill");

    await pickup.check();
    const step2 = page.getByRole("region", { name: "2. Delivery or pickup" });
    await expect(step2.getByText("Pickup address: Beau Bassin")).toBeVisible();
    await expect(step2.getByText("Pickup: free")).toBeVisible();
    await expect(page.getByLabel("Delivery address")).toBeHidden();
    await expect(bar.getByText("Rs 1,050", { exact: true })).toBeHidden();
    await expect(bar.getByText("Rs 850", { exact: true }).locator("visible=true")).toHaveCount(1);
    await expect(page.getByText("Delivery fee Rs 200")).toBeHidden();
  });

  test("AC7: keyboard order, visible focus, no clipping or sideways scroll, 44 px targets at 100% and 200%", async ({ page }) => {
    await basketWithCake(page);
    await expectAccessibleLayout(page);

    await page.getByRole("radio", { name: /Delivery/ }).check();
    await expectAccessibleLayout(page);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`AC8: visible labels tied to fields; axe clean in ${colorScheme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await basketWithCake(page);

      await expect(page.getByRole("group", { name: "How would you like to get your order?" })).toBeVisible();
      await expectNoA11yViolations(page);
      await page.getByRole("radio", { name: /Delivery/ }).check();
      await expect(page.getByLabel("Delivery address")).toHaveAttribute("id", "address");
      await expect(page.locator('label[for="address"]')).toBeVisible();
      await expect(page.locator('label[for="landmark"]')).toBeVisible();
      await expectNoA11yViolations(page);
      await expectNoA11yViolations(page, { zoom: 2 });
    });
  }

  test("AC5: the French basket uses the French labels", async ({ page }) => {
    await basketWithCake(page, "/fr/basket");

    await expect(page.getByRole("heading", { level: 2, name: "1. Panier" })).toBeVisible();
    await expect(page.getByRole("button", { name: `Augmenter la quantité de ${SAMPLE_PRODUCT.nameFr}` })).toBeVisible();
    await page.getByRole("radio", { name: /Retrait/ }).check();
    await expect(page.getByRole("region", { name: "2. Livraison ou retrait" }).getByText("Retrait : gratuit")).toBeVisible();
  });
});

test.describe("S-012 without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("AC9: lines show, quantity changes work through form posts and totals are correct", async ({ page }) => {
    await basketWithCake(page);

    await page.getByRole("button", { name: `Increase quantity of ${SAMPLE_PRODUCT.nameEn}` }).click();
    await expect(page).toHaveURL(/\/basket$/);
    await expect(page.getByRole("group", { name: `Quantity of ${SAMPLE_PRODUCT.nameEn}` }).locator("output")).toHaveText("2");
    await expect(page.getByText("Rs 1,700").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Basket, 2 items" })).toBeVisible();

    await page.getByRole("radio", { name: /Delivery/ }).check();
    await expect(page.locator("[data-sticky-bar]").getByText("Rs 1,900", { exact: true })).toBeVisible();
  });
});

/** Fills a valid order on the basket page. */
async function fillOrder(page: Page, fulfilment: "delivery" | "pickup", locale: "en" | "fr" = "en", options: { js?: boolean } = {}) {
  const en = locale === "en";
  await page.getByRole("radio", { name: en ? /^Delivery/ : /^Livraison/ }).first().waitFor();
  if (fulfilment === "delivery") {
    await page.getByRole("radio", { name: en ? /^Delivery/ : /^Livraison/ }).check();
    await page.getByLabel(en ? "Delivery address" : "Adresse de livraison").fill("12 Royal Road, Rose Hill");
  } else {
    await page.getByRole("radio", { name: en ? /^Pickup/ : /^Retrait/ }).check();
  }
  // Tue 24 Nov: orderable from the e2e clock (Fri 20 Nov, notice 3, Sunday closed; S-083).
  await chooseDate(page, "2026-11-24", { js: options.js, locale });
  await page.getByRole("radio", { name: en ? /^Morning/ : /^Matin/ }).locator("visible=true").check();
  await page.getByLabel(en ? "Name" : "Nom", { exact: true }).fill("E2E Guest");
  await page.getByLabel(en ? "Phone" : "Téléphone", { exact: true }).fill("5712 3456");
  await page.getByLabel(en ? "Email" : "E-mail", { exact: true }).fill(`guest-${test.info().testId}-${Date.now()}@e2e.test`);
  await page.getByRole("checkbox", { name: en ? "I accept the order policies" : "J'accepte les conditions de commande" }).check();
}

/** Tabs through the page; every focused control's box stays above the sticky bar. */
async function expectFocusNotObscured(page: Page, bar: ReturnType<Page["locator"]>) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const covered: string[] = [];
  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press("Tab");
    const focused = page.locator(":focus");
    if ((await focused.count()) === 0) break;
    const inBar = await focused.evaluate((el) => Boolean(el.closest("[data-sticky-bar]")));
    if (inBar) break;
    const [box, barBox] = [await focused.boundingBox(), await bar.boundingBox()];
    if (box && barBox && box.y + box.height > barBox.y + 1 && box.y < barBox.y + barBox.height) {
      covered.push((await focused.getAttribute("id")) ?? (await focused.textContent()) ?? "?");
    }
  }
  expect(covered, "controls hidden under the sticky bar when focused").toEqual([]);
}

const TOKEN_URL = /\/order\/([A-Za-z0-9_-]{43})\/confirmed$/;

test.describe("S-013 place an order as a guest", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await setClock(context, baseURL!, "2026-11-20T06:00:00Z");
  });

  test("AC4, AC11: a delivery order is stored pending approval and I land on its confirmation with an empty basket", async ({ page, db }) => {
    await basketWithCake(page);
    await hydrated(page);
    await fillOrder(page, "delivery");
    await page.getByRole("button", { name: "Place order" }).click();

    await expect(page).toHaveURL(TOKEN_URL);
    const token = TOKEN_URL.exec(page.url())![1]!;
    const [order] = await db<{ status: string; total_rs: number; delivery_fee_rs: number; locale: string; contact_phone: string }[]>`
      select status, total_rs, delivery_fee_rs, locale, contact_phone from orders where tracking_token = ${token}`;
    // Since 2026-11-13 an order waits for its Juice payment first (S-278 AC1).
    expect(order).toEqual({ status: "awaiting_payment", total_rs: 1050, delivery_fee_rs: 200, locale: "en", contact_phone: "+23057123456" });
    await expect(page.getByRole("link", { name: "Basket, 0 items" })).toBeVisible();
  });

  test("AC4, AC11: a French pickup order has no fee, locale fr and a /fr confirmation URL", async ({ page, db }) => {
    await basketWithCake(page, "/fr/basket");
    await hydrated(page);
    await fillOrder(page, "pickup", "fr");
    await page.getByRole("button", { name: "Commander" }).click();

    await expect(page).toHaveURL(/\/fr\/order\/[A-Za-z0-9_-]{43}\/confirmed$/);
    const token = TOKEN_URL.exec(page.url())![1]!;
    const [order] = await db<{ total_rs: number; delivery_fee_rs: number; locale: string }[]>`
      select total_rs, delivery_fee_rs, locale from orders where tracking_token = ${token}`;
    expect(order).toEqual({ total_rs: 850, delivery_fee_rs: 0, locale: "fr" });
  });

  test("AC48 (checkout spec): the confirmation after Place order opens no database connection; a refresh shows the same page", async ({ page }) => {
    await basketWithCake(page);
    await hydrated(page);
    await fillOrder(page, "pickup");
    const confirmationData = page.waitForResponse((r) => /\/order\/[A-Za-z0-9_-]{43}\/confirmed\.data/.test(r.url()));
    await page.getByRole("button", { name: "Place order" }).click();

    const timing = (await (await confirmationData).allHeaders())["server-timing"] ?? "";
    expect(timing).not.toContain("db-connect");
    await expect(page).toHaveURL(TOKEN_URL);
    const number = page.getByRole("region", { name: "Your order number" }).locator("p").first();
    await expect(number).toHaveText(/^APB-\d+$/);
    const shown = await number.textContent();

    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
    await expect(number).toHaveText(shown!);
    await expect(page.getByRole("link", { name: "Follow my order" })).toHaveAttribute("href", /\/t\/[A-Za-z0-9_-]{43}$/);
  });

  test("AC2, AC13: an empty submit moves focus to an error summary whose links reach each field", async ({ page }) => {
    await basketWithCake(page);
    await hydrated(page);
    await page.getByRole("button", { name: "Place order" }).click();

    const summary = page.getByRole("alert").filter({ hasText: "Please check your order" });
    await expect(summary).toBeFocused();
    for (const text of ["Choose delivery or pickup.", "Choose a date.", "Enter your name.", "Enter a phone number, for example 5712 3456.", "Enter an email address, for example name@example.com.", "Tick the box to accept the order policies."]) {
      await expect(summary.getByRole("link", { name: text })).toBeVisible();
    }
    await summary.getByRole("link", { name: "Enter your name." }).click();
    const name = page.getByLabel("Name", { exact: true });
    await expect(name).toBeFocused();
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await expect(name).toHaveAccessibleDescription("Enter your name.");
    await expect(page.getByLabel("Phone", { exact: true })).toHaveAccessibleDescription(/Enter a phone number/);
  });

  test("AC1, AC2: an invalid phone is refused and the typed values stay", async ({ page }) => {
    await basketWithCake(page);
    await hydrated(page);
    await fillOrder(page, "pickup");
    await page.getByLabel("Phone", { exact: true }).fill("12345");
    await page.getByRole("button", { name: "Place order" }).click();

    await expect(page.getByRole("link", { name: "Enter a phone number, for example 5712 3456." })).toBeVisible();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("E2E Guest");
    await expect(page).toHaveURL(/\/basket$/);
  });

  test("AC3: the dates start from the earliest orderable day in Mauritius (S-083) and the times are the Settings windows", async ({ page }) => {
    await basketWithCake(page);

    // Fri 20 Nov + 3 days' notice = Mon 23 Nov (S-083); the calendar says so (S-087).
    await expect(page.getByText("Earliest date: Mon 23 Nov")).toBeVisible();
    await page.getByRole("radio", { name: /^Delivery/ }).check();
    const times = page.getByRole("group", { name: "Delivery time" }).getByRole("radio");
    await expect(times).toHaveCount(3);
    for (const name of ["Morning · 09:00–12:00", "Afternoon · 12:00–17:00", "Evening · 17:00–20:00"]) {
      await expect(page.getByRole("radio", { name, exact: true }).locator("visible=true")).toHaveCount(1);
    }
  });

  test("AC12: keyboard, focus, 320/375 px and 200% zoom, 44 px targets; the sticky bar leaves while typing", async ({ page }) => {
    await basketWithCake(page);
    await page.getByRole("radio", { name: /^Delivery/ }).check();
    await expectAccessibleLayout(page);

    const bar = page.locator("[data-sticky-bar]");
    await expect(bar).toHaveCSS("position", "sticky");
    // Tabbing to each control keeps it clear of the sticky bar (WCAG 2.4.11 focus not obscured).
    await expectFocusNotObscured(page, bar);
    await page.getByLabel("Phone", { exact: true }).focus();
    await expect(bar).toHaveCSS("position", "static");
    await page.getByRole("checkbox", { name: "I accept the order policies" }).focus();
    await expect(bar).toHaveCSS("position", "sticky");
  });

  test("AC13: fields have visible labels, autocomplete and keyboard types", async ({ page }) => {
    await basketWithCake(page);

    const fields: [string, string, string | null, string | null][] = [
      ["Name", "name", "text", null],
      ["Phone", "tel", "tel", "tel"],
      ["Email", "email", "email", "email"],
      ["Note for the bakery (optional)", "off", null, null],
      // The date is a calendar grid with JavaScript (S-087); its no-JS field: checkout-dates.spec.ts.
    ];
    for (const [label, autocomplete, type, inputmode] of fields) {
      const field = page.getByLabel(label, { exact: true });
      await expect(field).toBeVisible();
      await expect(field).toHaveAttribute("autocomplete", autocomplete);
      if (type) await expect(field).toHaveAttribute("type", type);
      if (inputmode) await expect(field).toHaveAttribute("inputmode", inputmode);
      const id = await field.getAttribute("id");
      await expect(page.locator(`label[for="${id}"]`)).toBeVisible();
    }
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`AC13: axe clean in ${colorScheme} mode, with and without errors`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await basketWithCake(page);
      await hydrated(page);
      await page.getByRole("radio", { name: /^Delivery/ }).check();
      await expectNoA11yViolations(page);

      await page.getByRole("button", { name: "Place order" }).click();
      await expect(page.getByRole("alert").filter({ hasText: "Please check your order" })).toBeFocused();
      await expectNoA11yViolations(page);
      await expectNoA11yViolations(page, { zoom: 2 });
    });
  }

  test("AC14: the summary shows items, fee line, total and Juice number; the policies open from Settings", async ({ page }) => {
    await basketWithCake(page);
    await page.getByRole("radio", { name: /^Delivery/ }).check();

    const summary = page.getByRole("region", { name: "6. Summary" });
    await expect(summary.getByText(`${SAMPLE_PRODUCT.nameEn} × 1`)).toBeVisible();
    await expect(summary.getByText("Delivery fee", { exact: true })).toBeVisible();
    await expect(summary.getByText("Total", { exact: true }).locator("visible=true")).toHaveCount(1);
    await expect(summary.getByText("Rs 1,050")).toBeVisible();
    // Full payment by Juice; the account is shown only after placing (S-278 AC6, S-277 AC4).
    await expect(summary.getByText("Payment: the full amount by MCB Juice. You get the payment details as soon as you place your order.")).toBeVisible();
    await expect(summary.getByText(/5000 0000/)).toHaveCount(0);

    await expect(page.getByText(E2E_POLICIES.en)).toBeHidden();
    await page.getByText("Read the order policies (cancellation and storage)").click();
    await expect(page.getByText(E2E_POLICIES.en)).toBeVisible();

    await page.getByRole("radio", { name: /^Pickup/ }).check();
    await expect(summary.getByText("Pickup: free")).toBeVisible();
    await expect(summary.getByText("Delivery fee", { exact: true })).toBeHidden();
  });
});

test.describe("S-013 without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("a pickup order can be placed with plain form posts", async ({ page, context, baseURL, db }) => {
    await setClock(context, baseURL!, "2026-11-20T06:00:00Z");
    await basketWithCake(page);
    await fillOrder(page, "pickup", "en", { js: false });
    await page.getByRole("button", { name: "Place order" }).click();

    await expect(page).toHaveURL(TOKEN_URL);
    const token = TOKEN_URL.exec(page.url())![1]!;
    const [order] = await db<{ total_rs: number }[]>`select total_rs from orders where tracking_token = ${token}`;
    expect(order).toEqual({ total_rs: 850 });
  });

  test("a delivery order is placed on the first submit, with no PRICE_CHANGED round trip", async ({ page, context, baseURL, db }) => {
    await setClock(context, baseURL!, "2026-11-20T06:00:00Z");
    await basketWithCake(page);
    await fillOrder(page, "delivery", "en", { js: false });
    await page.getByRole("button", { name: "Place order" }).click();

    await expect(page).toHaveURL(TOKEN_URL);
    const token = TOKEN_URL.exec(page.url())![1]!;
    const [order] = await db<{ total_rs: number; delivery_fee_rs: number }[]>`select total_rs, delivery_fee_rs from orders where tracking_token = ${token}`;
    expect(order).toEqual({ total_rs: 1050, delivery_fee_rs: 200 });
  });
});

/** A valid pickup placeOrder form for direct HTTP posts (as a no-JavaScript browser sends it). */
function pickupOrderForm(idempotencyKey: string, email: string) {
  return {
    intent: "placeOrder",
    idempotencyKey,
    "displayedTotalRs.delivery": "1050",
    "displayedTotalRs.pickup": "850",
    fulfilment: "pickup",
    date: "2026-11-24",
    "windowId.pickup": "morning",
    "contact.name": "E2E Guest",
    "contact.phone": "5712 3456",
    "contact.email": email,
    acceptPolicies: "on",
  };
}

/** The browser context's cookies (basket, test clock) as one Cookie header. */
async function cookieHeader(page: Page) {
  return (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
}

const uniqueEmail = (tag: string) => `${tag}-${test.info().testId}-${test.info().project.name}-${Date.now()}@e2e.test`;

test.describe("S-014 double tap creates one order", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await setClock(context, baseURL!, "2026-11-20T06:00:00Z");
  });

  test("AC7: double-click Send: the button is busy, says Sending your order…, keeps focus, and one order is made", async ({ page, db }) => {
    await basketWithCake(page);
    await hydrated(page);
    await fillOrder(page, "pickup");
    const email = await page.getByLabel("Email", { exact: true }).inputValue();
    // Hold the submit so the loading state can be observed.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(/\/basket(\.data)?(\?.*)?$/, async (route) => {
      if (route.request().method() === "POST") await held;
      await route.continue();
    });

    await page.getByRole("button", { name: "Place order" }).dblclick();
    const button = page.getByRole("button", { name: "Sending your order…" });
    await expect(button).toHaveAttribute("aria-busy", "true");
    await expect(button).toHaveAttribute("aria-disabled", "true");
    // Not the disabled attribute: it keeps keyboard focus; a further tap is ignored.
    await expect(button).toHaveJSProperty("disabled", false);
    await expect(button).toBeFocused();
    await expect(page.getByTestId("pending-spinner")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Sending your order…" })).toBeAttached();
    await button.click({ force: true });
    release();

    await expect(page).toHaveURL(TOKEN_URL);
    const rows = await db`select number from orders where contact_email = ${email}`;
    expect(rows).toHaveLength(1);
  });

  test("AC1, AC3: two simultaneous posts with the same key against Postgres make one order and the same redirect", async ({ page, db, playwright, baseURL }) => {
    await basketWithCake(page);
    const api = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { cookie: await cookieHeader(page), origin: baseURL!, "cf-connecting-ip": testIp() } });
    const email = uniqueEmail("same-key");
    const form = pickupOrderForm(crypto.randomUUID(), email);

    const responses = await Promise.all([1, 2].map(() => api.post("/basket", { form, maxRedirects: 0 })));
    await api.dispose();

    expect(responses.map((r) => r.status())).toEqual([302, 302]);
    const [a, b] = responses.map((r) => r.headers().location);
    expect(a).toMatch(/^\/order\/[A-Za-z0-9_-]{43}\/confirmed$/);
    expect(b).toBe(a);
    const orders = await db<{ id: string }[]>`select id from orders where contact_email = ${email}`;
    expect(orders).toHaveLength(1);
    const outbox = await db`select id from email_outbox where order_id = ${orders[0]!.id} and template = 'order_received'`;
    expect(outbox).toHaveLength(1);
  });

  test("AC6: 20 concurrent placements against Postgres get unique numbers with no gaps", async ({ page, db, playwright, baseURL }) => {
    await basketWithCake(page);
    const api = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { cookie: await cookieHeader(page), origin: baseURL!, "cf-connecting-ip": testIp() } });
    const email = uniqueEmail("burst");

    // Twenty visitors at once, each its own IP (RL-order's 5 per IP is not what is tested here).
    const tag = Math.floor(Math.random() * 250);
    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, i) => api.post("/basket", { form: pickupOrderForm(crypto.randomUUID(), email), headers: { "cf-connecting-ip": `198.18.${tag}.${i + 1}` }, maxRedirects: 0 })),
    );
    await api.dispose();

    expect(responses.map((r) => r.status())).toEqual(Array(20).fill(302));
    const ours = (await db<{ number: number }[]>`select number from orders where contact_email = ${email}`).map((r) => r.number);
    expect(new Set(ours).size).toBe(20);
    // The counter row lock is held to commit, so every number up to our highest is a committed order.
    const max = Math.max(...ours);
    const [{ n }] = await db<{ n: number }[]>`select count(distinct number)::int as n from orders where number <= ${max}`;
    expect(n).toBe(max);
  });
});

test.describe("S-014 without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("AC7: a double-clicked plain form post makes one order, and re-sending that post returns the same one", async ({ page, context, baseURL, db, playwright }) => {
    await setClock(context, baseURL!, "2026-11-20T06:00:00Z");
    await basketWithCake(page);
    await fillOrder(page, "pickup", "en", { js: false });
    const email = await page.getByLabel("Email", { exact: true }).inputValue();
    let sent: string | null = null;
    await page.route(/\/basket$/, async (route) => {
      if (route.request().method() === "POST") sent ??= route.request().postData();
      await route.continue();
    });
    const cookie = await cookieHeader(page);

    await page.getByRole("button", { name: "Place order" }).dblclick();
    await expect(page).toHaveURL(TOKEN_URL);
    const confirmation = new URL(page.url()).pathname;

    // The same post reaching the server again (double submit, refresh, Back + resend), twice at once.
    const api = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { cookie, origin: baseURL!, "cf-connecting-ip": testIp(), "content-type": "application/x-www-form-urlencoded" } });
    const replays = await Promise.all([1, 2].map(() => api.post("/basket", { data: sent!, maxRedirects: 0 })));
    await api.dispose();
    expect(replays.map((r) => [r.status(), r.headers().location])).toEqual([
      [302, confirmation],
      [302, confirmation],
    ]);
    const rows = await db`select number from orders where contact_email = ${email}`;
    expect(rows).toHaveLength(1);
  });
});

test.describe("S-015 order confirmation", () => {
  test("AC1, AC7: after placing an order the page focuses the heading and shows number, notice, link, Copy and Share", async ({ page, context, baseURL, db }) => {
    await setClock(context, baseURL!, "2026-11-20T06:00:00Z");
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL! });
    await basketWithCake(page);
    await hydrated(page);
    await fillOrder(page, "pickup");
    await page.getByRole("button", { name: "Place order" }).click();
    await expect(page).toHaveURL(TOKEN_URL);
    const token = TOKEN_URL.exec(page.url())![1]!;
    const [order] = await db<{ number: number }[]>`select number from orders where tracking_token = ${token}`;
    const number = `APB-${String(order!.number).padStart(4, "0")}`;

    await expect(page.getByRole("heading", { level: 1, name: "Thank you, we have your order" })).toBeFocused();
    await expect(page.getByText(number, { exact: true })).toBeVisible();
    // The Juice instructions, or their calm fallback while Settings has no Juice name (another spec may set it).
    await expect(page.getByTestId("payment-instructions").or(page.getByTestId("payment-fallback"))).toBeVisible();
    const trackingUrl = `${baseURL}/t/${token}`;
    await expect(page.getByText(trackingUrl, { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Follow my order" })).toHaveAttribute("href", trackingUrl);
    await expect(page.getByRole("link", { name: "Share tracking link" })).toHaveAttribute("href", /^https:\/\/wa\.me\/\?text=/);

    const status = page.getByRole("status").filter({ hasText: /copied/i });
    await page.getByRole("button", { name: "Copy order number" }).click();
    await expect(status).toHaveText("Order number copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(number);
    await page.getByRole("button", { name: "Copy tracking link" }).click();
    await expect(status).toHaveText("Link copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(trackingUrl);
  });

  test("AC2, AC4: a refresh shows the same order with no-store, noindex and no-referrer headers", async ({ page, db }) => {
    const order = await createOrder(db, "S-015 refresh");

    for (let i = 0; i < 2; i += 1) {
      const response = await page.goto(`/order/${order.trackingToken}/confirmed`);
      expect(response!.status()).toBe(200);
      const headers = response!.headers();
      expect(headers["cache-control"]).toBe("no-store");
      expect(headers["x-robots-tag"]).toContain("noindex");
      expect(headers["referrer-policy"]).toBe("no-referrer");
      await expect(page.getByText(`APB-${String(order.number).padStart(4, "0")}`, { exact: true })).toBeVisible();
    }
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    // Specs run in parallel, so "nothing new" is checked as: still exactly this one order behind the token.
    expect((await db`select id from orders where tracking_token = ${order.trackingToken}`).length).toBe(1);
  });

  test("AC3: wrong and malformed tokens show the same not-found page with a 404 and the private headers", async ({ page, db }) => {
    const order = await createOrder(db, "S-015 wrong");
    const wrong = `${order.trackingToken.slice(0, 42)}${order.trackingToken.endsWith("A") ? "B" : "A"}`;
    const bodies: string[] = [];
    for (const token of [wrong, "A".repeat(43), "short"]) {
      const response = await page.goto(`/order/${token}/confirmed`);
      expect(response!.status()).toBe(404);
      expect(response!.headers()["referrer-policy"]).toBe("no-referrer");
      expect(response!.headers()["cache-control"]).toBe("no-store");
      await expect(page.getByRole("heading", { level: 1, name: "We can't find this order" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Message us on WhatsApp" })).toBeVisible();
      bodies.push((await page.locator("main").innerText()).replaceAll(token, ""));
    }
    expect(new Set(bodies).size).toBe(1);
  });

  test("AC5: a French order's confirmation is in French", async ({ page, db }) => {
    const order = await createOrder(db, "S-015 fr");
    // A new order waits for its Juice payment (S-278): the page leads with the payment block.
    await db`update orders set status = 'awaiting_payment' where id = ${order.id}`;
    await page.goto(`/fr/order/${order.trackingToken}/confirmed`);

    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByRole("heading", { level: 1, name: "Merci, nous avons bien reçu votre commande" })).toBeVisible();
    // The French payment instructions, or their French fallback while Settings has no Juice name.
    await expect(page.getByRole("region", { name: "Payez maintenant pour confirmer votre commande" }).or(page.getByText("Nous vous enverrons les informations de paiement sur WhatsApp"))).toBeVisible();
  });

  test("AC6: keyboard order, visible focus, no clipping or sideways scroll, 44 px targets at 100% and 200%", async ({ page, db }) => {
    const order = await createOrder(db, "S-015 layout");
    await page.goto(`/order/${order.trackingToken}/confirmed`);
    await hydrated(page);

    await expect(page.getByRole("button", { name: "Copy tracking link" })).toBeVisible();
    await expectAccessibleLayout(page);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`AC7: axe clean in ${colorScheme} mode, also at 200% and on the not-found page`, async ({ page, db }) => {
      await page.emulateMedia({ colorScheme });
      const order = await createOrder(db, `S-015 axe ${colorScheme}`);
      await page.goto(`/order/${order.trackingToken}/confirmed`);
      await hydrated(page);
      await expectNoA11yViolations(page);
      await expectNoA11yViolations(page, { zoom: 2 });

      await page.goto(`/order/${"A".repeat(43)}/confirmed`);
      await expectNoA11yViolations(page);
    });
  }
});

/** 375 px screenshots for the review report, only when E05_SHOTS names a folder. */
async function shot(page: Page, name: string) {
  const dir = process.env.E05_SHOTS;
  if (!dir || page.viewportSize()?.width !== 375) return;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/checkout-${name}.png`, fullPage: true });
}

/** A basket holding one line of a fresh product, opened at `path` once hydrated. */
async function basketOf(page: Page, db: Parameters<typeof createProduct>[0], baseURL: string, setup: { minQuantity?: number; quantity?: number } = {}, path = "/basket") {
  const product = await createProduct(db, { name: "Cupcake box" });
  if (setup.minQuantity) await db`update product set min_quantity = ${setup.minQuantity} where id = ${product.id}`;
  const line = { lineId: "m1", productId: product.id, options: [], quantity: setup.quantity ?? 1 };
  await page.context().addCookies([{ name: "apb_basket", value: encodeURIComponent(JSON.stringify([line])), url: baseURL, sameSite: "Lax" }]);
  await page.goto(path);
  await hydrated(page);
  return product;
}

test.describe("E-05 basket and summary", () => {
  test("S-085 AC4: the stepper stops at the product's minimum and says why, tied to the button", async ({ page, db, baseURL }) => {
    const product = await basketOf(page, db, baseURL!, { minQuantity: 6, quantity: 7 });
    const decrease = page.getByRole("button", { name: `Decrease quantity of ${product.name}` });

    await decrease.click();
    await expect(page.getByRole("group", { name: `Quantity of ${product.name}` }).locator("output")).toHaveText("6");
    // At the minimum the button is aria-disabled (still focusable): a tap only explains.
    await decrease.click({ force: true });
    await expect(page.getByRole("group", { name: `Quantity of ${product.name}` }).locator("output")).toHaveText("6");
    await expect(decrease).toHaveAccessibleDescription("This item comes in at least 6. To take it out, press Remove.");
    await expect(page.getByText("No longer available")).toHaveCount(0);
  });

  test("S-090 AC6: the button reads Place order, then Place order at the total of the chosen fulfilment", async ({ page, db, baseURL }) => {
    await basketOf(page, db, baseURL!);
    await expect(page.getByRole("button", { name: "Place order", exact: true })).toBeVisible();

    await page.getByRole("radio", { name: /^Delivery/ }).check();
    await expect(page.getByRole("button", { name: /^Place order at Rs\s1,050$/ })).toBeVisible();
    await page.getByRole("radio", { name: /^Pickup/ }).check();
    await expect(page.getByRole("button", { name: /^Place order at Rs\s850$/ })).toBeVisible();
    await shot(page, "basket-pickup");
    await expectNoHorizontalScroll(page);
  });

  test("S-090 AC4: the policies say how we use the details; French on /fr", async ({ page, db, baseURL }) => {
    await basketOf(page, db, baseURL!, {}, "/fr/basket");
    await page.getByText("Lire les conditions de commande", { exact: false }).click();

    await expect(page.getByText("Nous utilisons vos coordonnées uniquement pour préparer, livrer et suivre cette commande.", { exact: false })).toBeVisible();
    await page.getByRole("radio", { name: /^Retrait/ }).check();
    await expect(page.getByRole("button", { name: /^Commander pour Rs\s850$/ })).toBeVisible();
    await shot(page, "basket-fr");
    await expectNoA11yViolations(page);
  });
});

test.describe("S-098 journeys on a phone", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await setClock(context, baseURL!, "2026-11-20T06:00:00Z");
  });

  test("J1 (AC1, AC7) then J3 (AC3): two items delivered; displayed, stored, confirmation and tracking totals agree; the guest cancels from tracking", async ({ page, db, baseURL }) => {
    const first = await createProduct(db, { name: "Lemon tart" });
    const second = await createProduct(db, { name: "Fraisier" });
    const lines = [first, second].map((p, i) => ({ lineId: `j${i}`, productId: p.id, options: [], quantity: 1 }));
    await page.context().addCookies([{ name: "apb_basket", value: encodeURIComponent(JSON.stringify(lines)), url: baseURL!, sameSite: "Lax" }]);
    await page.goto("/basket");
    await hydrated(page);
    await fillOrder(page, "delivery");

    // Rs 850 + Rs 850 + delivery Rs 200, on the button and in the bar.
    const button = page.getByRole("button", { name: /^Place order at Rs\s1,900$/ });
    await expect(page.locator("[data-sticky-bar]").getByText("Rs 1,900", { exact: true })).toBeVisible();
    await shot(page, "basket-ready");
    await button.click();

    await expect(page).toHaveURL(TOKEN_URL);
    const token = TOKEN_URL.exec(page.url())![1]!;
    const [order] = await db<{ number: number; total_rs: number; status: string }[]>`select number, total_rs, status from orders where tracking_token = ${token}`;
    expect(order).toMatchObject({ total_rs: 1900, status: "awaiting_payment" });
    const number = `APB-${String(order!.number).padStart(4, "0")}`;
    await expect(page.getByText(number, { exact: true })).toBeVisible();
    await expect(page.getByText("Rs 1,900").first()).toBeVisible();
    await shot(page, "confirmation");

    await page.getByRole("link", { name: "Follow my order" }).click();
    await expect(page.getByRole("heading", { level: 1, name: `Order ${number}` })).toBeVisible();
    await expect(page.getByText("Rs 1,900").first()).toBeVisible();
    await shot(page, "tracking-awaiting-payment");

    await page.getByRole("button", { name: `Cancel order ${number}` }).click();
    await page.getByRole("dialog").getByRole("button", { name: `Cancel order ${number}` }).click();
    await expect(page.getByText("Nothing will be prepared. We have sent you an email to confirm.")).toBeVisible();
    const [after] = await db<{ status: string; cancel_reason: string }[]>`select status, cancel_reason from orders where tracking_token = ${token}`;
    expect(after).toEqual({ status: "cancelled", cancel_reason: "customer" });
    await expectNoA11yViolations(page);
  });
});

test.describe("E-05 basket without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("S-090 AC6: the chosen fulfilment's total is on the button from CSS alone", async ({ page, db, baseURL }) => {
    const product = await createProduct(db, { name: "No-JS cake" });
    const line = { lineId: "n1", productId: product.id, options: [], quantity: 1 };
    await page.context().addCookies([{ name: "apb_basket", value: encodeURIComponent(JSON.stringify([line])), url: baseURL!, sameSite: "Lax" }]);
    await page.goto("/basket");

    await page.getByRole("radio", { name: /^Delivery/ }).check();
    await expect(page.getByRole("button", { name: /^Place order at Rs\s1,050$/ })).toBeVisible();
  });
});
