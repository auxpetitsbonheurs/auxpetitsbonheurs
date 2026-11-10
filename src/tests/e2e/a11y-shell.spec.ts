import {
  expectKeyboardOperable,
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  expectNothingClipped,
  expectTapTargets,
  withZoom,
} from "./support/a11y";
import { type Page, expect, test } from "./support/fixtures";

const BASKET_COOKIE = "apb_basket";

async function setBasket(page: Page, baseURL: string, quantity: number) {
  await page.context().addCookies([
    {
      name: BASKET_COOKIE,
      value: encodeURIComponent(JSON.stringify([{ productId: "sample", quantity }])),
      url: baseURL,
    },
  ]);
}

/** Waits until React has hydrated, so the next click is a client navigation. */
async function hydrated(page: Page) {
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
}

test.describe("page shell", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await setBasket(page, baseURL!, 2);
  });

  test("AC1: skip link first, one main/header/footer/h1, bakery name and labelled basket link", async ({ page }) => {
    await page.goto("/");

    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    const box = await skip.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);

    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.getByRole("banner")).toHaveCount(1);
    await expect(page.getByRole("contentinfo")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("banner").getByRole("link", { name: "Aux petits bonheurs" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Basket, 2 items" })).toBeVisible();

    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();
  });

  test("AC3: keyboard reaches every control in order with visible focus, at 100% and 200% zoom", async ({ page }) => {
    await page.goto("/");

    await expectKeyboardOperable(page);
    await withZoom(page, 2, () => expectKeyboardOperable(page));
  });

  test("AC3: no clipping, no sideways scroll and 44 px targets, at 100% and 200% zoom", async ({ page }) => {
    await page.goto("/");

    for (const zoom of [1, 2]) {
      await withZoom(page, zoom, async () => {
        await expectNoHorizontalScroll(page);
        await expectNothingClipped(page);
        await expectTapTargets(page);
      });
    }
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`AC4: axe is clean in ${colorScheme} mode with the token background`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto("/");

      const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(background).toBe(colorScheme === "light" ? "rgb(255, 248, 240)" : "rgb(36, 27, 28)");
      await expectNoA11yViolations(page);
      await expectNoA11yViolations(page, { zoom: 2 });
    });
  }

  test("AC5: with reduced motion the count change is announced politely and not animated", async ({ page, baseURL }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await hydrated(page);
    const status = page.getByRole("status");
    await expect(status).toHaveText("2 items in basket");
    await expect(status).toHaveAttribute("aria-live", "polite");

    await setBasket(page, baseURL!, 3);
    await page.getByRole("banner").getByRole("link", { name: "Aux petits bonheurs" }).click();

    await expect(status).toHaveText("3 items in basket");
    await expect(page.getByRole("link", { name: "Basket, 3 items" })).toBeVisible();
    const badge = page.locator("[data-basket-badge]");
    await expect(badge).toHaveCSS("animation-name", "none");
    await expect(page.getByRole("link", { name: "Basket, 3 items" })).toHaveCSS("transition-duration", "0s");
  });

  test("AC5: without reduced motion the count change bumps the badge", async ({ page, baseURL }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await hydrated(page);

    await setBasket(page, baseURL!, 3);
    await page.getByRole("banner").getByRole("link", { name: "Aux petits bonheurs" }).click();

    await expect(page.getByRole("status")).toHaveText("3 items in basket");
    await expect(page.locator("[data-basket-badge]")).toHaveCSS("animation-name", "basket-bump");
  });
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("AC7: the shell, navigation and basket link are server-rendered", async ({ page, baseURL }) => {
    await setBasket(page, baseURL!, 2);
    await page.goto("/");

    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.getByRole("navigation")).toBeVisible();
    await expect(page.getByRole("link", { name: "Basket, 2 items" })).toHaveAttribute("href", "/basket");
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();
    await expect(page.locator("html")).not.toHaveAttribute("data-hydrated", "true");
  });
});
