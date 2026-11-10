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
import { SAMPLE_PRODUCT } from "./support/database";
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
    await expect(page.getByText("Total before delivery")).toBeVisible();

    await delivery.check();
    await expect(page.getByLabel("Delivery address")).toBeVisible();
    await expect(page.getByLabel(/Landmark/)).toBeVisible();
    await expect(page.getByText("Delivery fee Rs 200")).toBeVisible();
    await expect(page.getByText("Total", { exact: true }).locator("visible=true")).toHaveCount(1);
    await expect(page.getByText("Rs 1,050")).toBeVisible();
    await page.getByLabel("Delivery address").fill("12 Royal Road, Rose Hill");

    await pickup.check();
    await expect(page.getByText("Pickup address: Beau Bassin")).toBeVisible();
    await expect(page.getByText("Pickup: free")).toBeVisible();
    await expect(page.getByLabel("Delivery address")).toBeHidden();
    await expect(page.getByText("Rs 1,050")).toBeHidden();
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
    await expect(page.getByText("Retrait : gratuit")).toBeVisible();
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
    await expect(page.getByText("Rs 1,900")).toBeVisible();
  });
});
