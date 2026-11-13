// S-065 AC9: the product page content at 320, 375 and 1280 px: photo buttons and arrow keys,
// distinct labels, 44 px, axe (light and dark), 200% zoom, no sideways scroll.
import { expectNoA11yViolations, expectNoHorizontalScroll, expectTapTargets, withZoom } from "./support/a11y";
import { createProduct } from "./support/catalogue";
import { type Page, expect, test } from "./support/fixtures";

async function open(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
}

test.describe("product page content (S-065)", () => {
  test("AC1, AC9: Previous/Next photo buttons and arrow keys change the photo; labels, targets, axe, zoom", async ({ page, db }) => {
    const product = await createProduct(db, { name: "Carousel cake", photos: 3 });
    await open(page, `/menu/${product.slug}`);
    const main = page.getByRole("main");

    await expect(main.getByText("Photo 1 of 3")).toBeVisible();
    await main.getByRole("button", { name: "Next photo" }).click();
    await expect(main.getByText("Photo 2 of 3")).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(main.getByText("Photo 3 of 3")).toBeVisible();
    await main.getByRole("button", { name: "Previous photo" }).focus();
    await page.keyboard.press("ArrowLeft");
    await expect(main.getByText("Photo 2 of 3")).toBeVisible();
    await expect(main.getByRole("img", { name: product.name })).toBeVisible();

    await expect(main.getByRole("heading", { name: "Allergens" })).toBeVisible();
    await expect(main.getByText(/^Earliest date: /)).toBeVisible();

    await expectNoHorizontalScroll(page);
    await expectTapTargets(page);
    await expectNoA11yViolations(page);
    await withZoom(page, 2, async () => {
      await expectNoHorizontalScroll(page);
      await expectTapTargets(page);
    });
    await page.emulateMedia({ colorScheme: "dark" });
    await expectNoA11yViolations(page);
  });

  test("AC5: a hidden product answers 404 'no longer available' with a link to the menu", async ({ page, db }) => {
    const product = await createProduct(db, { status: "hidden" });
    const response = await page.goto(`/fr/menu/${product.slug}`);

    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ce produit n'est plus disponible");
    await expect(page.getByRole("main").getByRole("link", { name: "Voir notre collection" })).toHaveAttribute("href", "/fr/menu");
    await expect(page.getByRole("main")).not.toContainText(product.name);
  });
});
