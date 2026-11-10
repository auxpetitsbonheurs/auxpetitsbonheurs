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
