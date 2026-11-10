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
import { setClock } from "./support/clock";
import { E2E_POLICIES, SAMPLE_PRODUCT } from "./support/database";
import { type Page, expect, test } from "./support/fixtures";

const PRODUCT_PATH = `/menu/${SAMPLE_PRODUCT.slug}`;

/** Every layout check the a11y ACs name, at 100% and 200% zoom. */
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

test.describe("S-011 product page", () => {
  test("AC1: name, description, Rs 850, photo with the name as alt and an Add button", async ({ page }) => {
    await page.goto(PRODUCT_PATH);

    await expect(page.getByRole("heading", { level: 1, name: SAMPLE_PRODUCT.nameEn })).toBeVisible();
    await expect(page.getByText(SAMPLE_PRODUCT.descriptionEn)).toBeVisible();
    await expect(page.getByText("Rs 850", { exact: true })).toBeVisible();
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

  test("AC4: Add to basket goes to /basket and the header count shows 1", async ({ page }) => {
    await page.goto(PRODUCT_PATH);
    await page.getByRole("button", { name: "Add to basket" }).click();

    await expect(page).toHaveURL(/\/basket$/);
    await expect(page.getByRole("link", { name: "Basket, 1 item" })).toBeVisible();
    // Regression: links built in loaders after a client navigation never carry the `.data` suffix.
    await expect(page.getByRole("link", { name: "Français" })).toHaveAttribute("href", "/fr/basket");
    const cookie = (await page.context().cookies()).find((c) => c.name === "apb_basket");
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax" });
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
  await expect(page).toHaveURL(new RegExp(`${basketPath}$`));
}

/** Waits until React has hydrated, so clicks go through fetchers. */
async function hydrated(page: Page) {
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
}

test.describe("S-012 basket and delivery or pickup", () => {
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

  test("AC3: at quantity 1 Decrease is disabled and explained", async ({ page }) => {
    await basketWithCake(page);

    await expect(page.getByRole("button", { name: `Decrease quantity of ${SAMPLE_PRODUCT.nameEn}` })).toBeDisabled();
    await expect(page.getByText("1 is the smallest quantity. To take this out, press Remove.")).toBeVisible();
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
    await expect(bar.getByText("Rs 1,050")).toBeVisible();
    await page.getByLabel("Delivery address").fill("12 Royal Road, Rose Hill");

    await pickup.check();
    const step2 = page.getByRole("region", { name: "2. Delivery or pickup" });
    await expect(step2.getByText("Pickup address: Beau Bassin")).toBeVisible();
    await expect(step2.getByText("Pickup: free")).toBeVisible();
    await expect(page.getByLabel("Delivery address")).toBeHidden();
    await expect(bar.getByText("Rs 1,050")).toBeHidden();
    await expect(bar.getByText("Rs 850").locator("visible=true")).toHaveCount(1);
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
    await expect(page.locator("[data-sticky-bar]").getByText("Rs 1,900")).toBeVisible();
  });
});

/** Fills a valid order on the basket page. */
async function fillOrder(page: Page, fulfilment: "delivery" | "pickup", locale: "en" | "fr" = "en") {
  const en = locale === "en";
  await page.getByRole("radio", { name: en ? /^Delivery/ : /^Livraison/ }).first().waitFor();
  if (fulfilment === "delivery") {
    await page.getByRole("radio", { name: en ? /^Delivery/ : /^Livraison/ }).check();
    await page.getByLabel(en ? "Delivery address" : "Adresse de livraison").fill("12 Royal Road, Rose Hill");
  } else {
    await page.getByRole("radio", { name: en ? /^Pickup/ : /^Retrait/ }).check();
  }
  await page.getByLabel("Date", { exact: true }).fill("2026-11-21");
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
    expect(order).toEqual({ status: "pending_approval", total_rs: 1050, delivery_fee_rs: 200, locale: "en", contact_phone: "+23057123456" });
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

  test("AC3: the date field starts at today in Mauritius and the times are the Settings windows", async ({ page }) => {
    await basketWithCake(page);

    await expect(page.getByLabel("Date", { exact: true })).toHaveAttribute("min", "2026-11-20");
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
      ["Date", "off", "date", null],
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
    await expect(summary.getByText("Pay by Juice to 5000 0000, or in cash when you receive your order.")).toBeVisible();

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
    await fillOrder(page, "pickup");
    await page.getByRole("button", { name: "Place order" }).click();

    await expect(page).toHaveURL(TOKEN_URL);
    const token = TOKEN_URL.exec(page.url())![1]!;
    const [order] = await db<{ total_rs: number }[]>`select total_rs from orders where tracking_token = ${token}`;
    expect(order).toEqual({ total_rs: 850 });
  });
});
