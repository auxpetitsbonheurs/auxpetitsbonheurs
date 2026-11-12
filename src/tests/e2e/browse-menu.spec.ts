// E-13 S-244: Our collection (/menu), grouped by type, from the cached menu (ADR-0004).
import { expectNoA11yViolations, expectNoHorizontalScroll, expectNothingClipped, expectTapTargets, withZoom } from "./support/a11y";
import { createProduct } from "./support/catalogue";
import { SAMPLE_PRODUCT } from "./support/database";
import { type Page, expect, test } from "./support/fixtures";

const card = (page: Page, name: string) => page.getByRole("listitem").filter({ has: page.getByRole("link", { name, exact: true }) });

async function hydrated(page: Page) {
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
}

test.describe("Our collection (S-244)", () => {
  test("AC1, AC2: 200 with the h1, a Cakes section and the sample cake's card linking to its page", async ({ page }) => {
    const response = await page.goto("/menu");

    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Our collection" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Cakes" })).toBeVisible();
    const cake = card(page, SAMPLE_PRODUCT.nameEn);
    await expect(cake.getByRole("img", { name: SAMPLE_PRODUCT.nameEn })).toHaveAttribute("width", /\d+/);
    await expect(cake.getByText("from Rs 850")).toHaveCSS("white-space", "nowrap");

    await cake.getByRole("link").click();
    await expect(page).toHaveURL(/\/menu\/chocolate-cake$/);
    await expect(page.getByRole("heading", { level: 1, name: SAMPLE_PRODUCT.nameEn })).toBeVisible();
  });

  test("AC1: French page and labels", async ({ page }) => {
    await page.goto("/fr/menu");

    await expect(page.getByRole("heading", { level: 1, name: "Notre collection" })).toBeVisible();
    await expect(page.getByRole("link", { name: SAMPLE_PRODUCT.nameFr, exact: true })).toHaveAttribute("href", "/fr/menu/chocolate-cake");
  });

  test("AC3, AC4: a sold-out card shows the label and still links; a hidden product is absent", async ({ page, db }) => {
    const soldOut = await createProduct(db, { name: "Sold cake", status: "sold_out" });
    const hidden = await createProduct(db, { name: "Hidden cake", status: "hidden" });

    await page.goto("/menu");

    const sold = card(page, soldOut.name);
    await expect(sold.getByText("Sold out")).toBeVisible();
    await expect(sold.getByRole("link")).toHaveAttribute("href", `/menu/${soldOut.slug}`);
    await expect(page.getByText(hidden.name)).toHaveCount(0);
  });

  test("AC5: a client navigation renders from the cached menu without asking the server for the page", async ({ page }) => {
    await page.goto("/");
    await hydrated(page);
    await expect.poll(() => page.evaluate(() => localStorage.getItem("apb_menu") !== null)).toBe(true);
    const dataRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes(".data")) dataRequests.push(request.url());
    });

    if ((page.viewportSize()?.width ?? 0) >= 1024) {
      await page.getByRole("banner").getByRole("link", { name: "Our collection" }).click();
    } else {
      await page.getByRole("button", { name: "Menu" }).click();
      await page.getByRole("dialog").getByRole("link", { name: "Our collection" }).click();
    }

    await expect(page.getByRole("heading", { level: 1, name: "Our collection" })).toBeVisible();
    await expect(page.getByRole("link", { name: SAMPLE_PRODUCT.nameEn, exact: true })).toBeVisible();
    expect(dataRequests).toEqual([]);
  });

  test("AC7: columns (2 / 3 / 4), one tab stop per card with a visible ring, no sideways scroll at 100% and 200%", async ({ page }) => {
    await page.goto("/menu");

    const width = page.viewportSize()!.width;
    const columns = await page.locator("section ul").first().evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
    expect(columns).toBe(width >= 1024 ? 4 : width >= 768 ? 3 : 2);
    const link = page.getByRole("link", { name: SAMPLE_PRODUCT.nameEn, exact: true });
    await link.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(link).toBeFocused();
    await expect(card(page, SAMPLE_PRODUCT.nameEn)).toHaveCSS("outline-style", "solid");
    for (const zoom of [1, 2]) {
      await withZoom(page, zoom, async () => {
        await expectNoHorizontalScroll(page);
        await expectNothingClipped(page);
        await expectTapTargets(page);
      });
    }
    await expectNoA11yViolations(page);
  });

  test("AC7: contrast holds in dark mode too (axe)", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/menu");

    await expectNoA11yViolations(page);
  });
});
