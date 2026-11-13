// S-063: Home in the real app at 320, 375 and 1280 px (the e2e seed has the sample cake, so
// "Our collection" shows at least the Cakes card).
import {
  expectKeyboardOperable,
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  expectNothingClipped,
  expectTapTargets,
  withZoom,
} from "./support/a11y";
import { type Page, expect, test } from "./support/fixtures";

async function open(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
}

test.describe("Home (S-063)", () => {
  for (const url of ["/", "/fr"]) {
    test(`AC8 ${url}: one h1, no sideways scroll, 44 px targets, keyboard, axe light and dark, 200% zoom`, async ({ page }) => {
      await open(page, url);

      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expectNoHorizontalScroll(page);
      await expectNothingClipped(page);
      await expectTapTargets(page);
      await expectKeyboardOperable(page, 80);
      await expectNoA11yViolations(page);
      await expectNoA11yViolations(page, { zoom: 2 });
      await withZoom(page, 2, () => expectTapTargets(page));
      await page.emulateMedia({ colorScheme: "dark" });
      await expectNoA11yViolations(page);
    });
  }

  test("AC1: the collection button, a category card to its menu section, and the custom-cake band", async ({ page }) => {
    await open(page, "/");
    const main = page.getByRole("main");

    await main.getByRole("link", { name: "Cakes" }).click();
    await expect(page).toHaveURL(/\/menu#type-cake$/);
    await expect(page.getByRole("heading", { level: 2, name: "Cakes" })).toBeVisible();

    await open(page, "/fr");
    await expect(page.getByRole("main").getByRole("link", { name: "Découvrir notre collection" })).toHaveAttribute("href", "/fr/menu");
    await expect(page.getByRole("main").getByRole("link", { name: "Demander un devis" })).toHaveAttribute("href", "/fr/custom-cake");
  });

  test("AC6: the hero image (when present) is high priority with a size; other images are lazy", async ({ page }) => {
    await open(page, "/");
    const images = page.getByRole("main").locator("img");
    const count = await images.count();
    for (let i = 0; i < count; i++) {
      const img = images.nth(i);
      await expect(img).toHaveAttribute("width", /\d+/);
      await expect(img).toHaveAttribute("height", /\d+/);
      const priority = await img.getAttribute("fetchpriority");
      if (priority !== "high") await expect(img).toHaveAttribute("loading", "lazy");
    }
  });
});
