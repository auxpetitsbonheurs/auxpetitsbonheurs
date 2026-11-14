// Logo job: the Owner's official badges. The header's badge loads (a real image, not a broken
// one) with its accessible name in English and French, keeps its box (no layout shift), the
// footer's badge loads, the header still fits at 320 px with no sideways scroll, and the tab
// icons and share image are the new files.
import { expectNoA11yViolations, expectNoHorizontalScroll } from "./support/a11y";
import type { Locator } from "@playwright/test";
import { type Page, expect, test } from "./support/fixtures";

async function open(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
}

/** Waits for the image to finish loading and returns its natural width (0 when broken). */
const naturalWidth = (image: Locator) => image.evaluate(async (img: HTMLImageElement) => (await img.decode().catch(() => undefined), img.naturalWidth));

for (const [locale, home, name] of [
  ["en", "/", "Aux petits bonheurs, home"],
  ["fr", "/fr/", "Aux petits bonheurs, accueil"],
] as const) {
  test(`header badge loads with its name and links home (${locale})`, async ({ page }) => {
    await open(page, home === "/" ? "/menu" : "/fr/menu");
    const link = page.getByRole("banner").getByRole("link", { name, exact: true });
    await expect(link).toHaveAttribute("href", home);
    const image = link.getByRole("img", { name, exact: true });
    expect(await naturalWidth(image)).toBeGreaterThan(0);
    // Explicit size (no layout shift), square, the size the layout reserves: 48 px at 320, else 56 px.
    await expect(image).toHaveAttribute("width", "56");
    await expect(image).toHaveAttribute("height", "56");
    expect(await image.evaluate((img: HTMLImageElement) => img.currentSrc)).toMatch(/\/brand\/badge-cream-\d+\.webp$/);
    const box = (await image.boundingBox())!;
    expect(box.width).toBe(page.viewportSize()!.width >= 368 ? 56 : 48);
    expect(box.height).toBe(box.width);
  });
}

test("the header fits: language, badge, basket and menu on one row, no sideways scroll, axe clean", async ({ page }) => {
  await open(page, "/");
  await expectNoHorizontalScroll(page);
  const banner = page.getByRole("banner");
  const logo = (await banner.getByRole("link", { name: "Aux petits bonheurs, home" }).boundingBox())!;
  const basket = (await banner.getByRole("link", { name: /^Basket/ }).boundingBox())!;
  expect(basket.x).toBeGreaterThanOrEqual(logo.x + logo.width);
  if (page.viewportSize()!.width < 1024) {
    const menu = (await banner.getByRole("button", { name: "Menu", exact: true }).boundingBox())!;
    // One row: the menu button is level with the badge, and inside the screen.
    expect(Math.abs(menu.y + menu.height / 2 - (logo.y + logo.height / 2))).toBeLessThan(4);
    expect(menu.x + menu.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
  await expectNoA11yViolations(page);
});

test("footer badge loads, named for the home page", async ({ page }) => {
  await open(page, "/contact");
  const image = page.getByRole("contentinfo").getByRole("img", { name: "Aux petits bonheurs, home page" });
  await image.scrollIntoViewIfNeeded();
  expect(await naturalWidth(image)).toBeGreaterThan(0);
  expect(await image.evaluate((img: HTMLImageElement) => img.currentSrc)).toMatch(/\/brand\/badge-cream-\d+\.webp$/);
});

test("tab icons, Apple touch icon and share image are the Owner's badge files, and they load", async ({ page, request }) => {
  await open(page, "/");
  const head = page.locator("head");
  await expect(head.locator('link[rel="icon"][sizes="32x32"]')).toHaveAttribute("href", "/favicon-32.png");
  await expect(head.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/apple-touch-icon.png");
  const origin = new URL(page.url()).origin;
  await expect(head.locator('meta[property="og:image"]')).toHaveAttribute("content", `${origin}/brand/og-image.jpg`);
  for (const [path, type] of [
    ["/favicon-32.png", "image/png"],
    ["/favicon-48.png", "image/png"],
    ["/favicon.ico", "image/"],
    ["/apple-touch-icon.png", "image/png"],
    ["/brand/og-image.jpg", "image/jpeg"],
    ["/brand/badge-burgundy-240.png", "image/png"],
  ] as const) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()["content-type"], path).toContain(type);
  }
});
