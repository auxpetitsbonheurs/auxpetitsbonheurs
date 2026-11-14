// S-284: the branded page-change loader. A client page change still loading after 300 ms shows
// the Owner's badge with a "Loading…" status; a fast one shows nothing; the first load never does;
// reduced motion keeps it still. Page data requests (`*.data`) are held or answered from
// a recording so the timing does not depend on the machine's speed.
import { expectNoA11yViolations } from "./support/a11y";
import type { Route } from "@playwright/test";
import { type Page, expect, test } from "./support/fixtures";

const loader = (page: Page) => page.locator("[data-page-loader]");
const badge = (page: Page) => page.locator("[data-page-loader-badge]");
const footer = (page: Page) => page.getByRole("contentinfo");

async function open(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
}

/** Holds every page-data request until `release()`; returns the release function. */
async function holdPageData(page: Page) {
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\.data(\?|$)/, async (route: Route) => {
    await released;
    await route.continue();
  });
  return release;
}

test.describe("page-change loader (S-284)", () => {
  test("AC1, AC4: a slow page change shows the badge and Loading…, axe clean, then it goes away", async ({ page }) => {
    await open(page, "/");
    await expect(loader(page)).toHaveCount(0);
    const release = await holdPageData(page);

    await footer(page).getByRole("link", { name: "Our story" }).click();
    const status = page.getByRole("status").filter({ hasText: "Loading…" });
    await expect(status).toBeAttached();
    await expect(badge(page)).toBeVisible();
    // The Owner's badge image, decorative (the status text is the announcement), loaded and
    // gently animated: the badge pulses and a gold arc circles its ring.
    const image = badge(page).locator("img");
    await expect(image).toHaveAttribute("alt", "");
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
    await expect(image).toHaveCSS("animation-name", "loader-pulse");
    await expect(page.locator("[data-loader-ring]")).toHaveCSS("animation-name", "loader-ring");
    // Click-through and fixed: nothing under it is blocked and the page does not move.
    await expect(loader(page)).toHaveCSS("pointer-events", "none");
    await expect(loader(page)).toHaveCSS("position", "fixed");
    await expectNoA11yViolations(page);

    release();
    await expect(page).toHaveURL(/\/our-story$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(loader(page)).toHaveCount(0);
  });

  test("AC4: French text Chargement…", async ({ page }) => {
    await open(page, "/fr");
    const release = await holdPageData(page);
    await footer(page).getByRole("link", { name: "Notre histoire" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Chargement…" })).toBeAttached();
    release();
    await expect(page).toHaveURL(/\/fr\/our-story$/);
    await expect(loader(page)).toHaveCount(0);
  });

  test("AC2, AC3: the first load and a fast page change never show the badge", async ({ page }) => {
    // Record the page's data once, then answer it from the recording at once.
    const recorded = new Map<string, { status: number; headers: Record<string, string>; body: Buffer }>();
    await page.route(/\.data(\?|$)/, async (route: Route) => {
      const key = new URL(route.request().url()).pathname;
      const hit = recorded.get(key);
      if (hit) return route.fulfill(hit);
      const response = await route.fetch();
      const answer = { status: response.status(), headers: response.headers(), body: await response.body() };
      recorded.set(key, answer);
      return route.fulfill(answer);
    });
    await open(page, "/");
    await footer(page).getByRole("link", { name: "Our story" }).click();
    await expect(page).toHaveURL(/\/our-story$/);

    await page.addInitScript(() => {
      const seen = { badge: false };
      (window as unknown as { __loaderSeen: typeof seen }).__loaderSeen = seen;
      new MutationObserver(() => {
        if (document.querySelector("[data-page-loader-badge]")) seen.badge = true;
      }).observe(document, { childList: true, subtree: true });
    });
    await open(page, "/");
    await footer(page).getByRole("link", { name: "Our story" }).click();
    await expect(page).toHaveURL(/\/our-story$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // The page change has committed, so the show timer is cancelled: the record is final.
    expect(await page.evaluate(() => (window as unknown as { __loaderSeen: { badge: boolean } }).__loaderSeen.badge)).toBe(false);
  });

  test("AC5: with reduced motion the badge and its ring stay still", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, "/");
    const release = await holdPageData(page);
    await footer(page).getByRole("link", { name: "Our story" }).click();
    await expect(badge(page)).toBeVisible();
    await expect(badge(page).locator("img")).toHaveCSS("animation-name", "none");
    await expect(page.locator("[data-loader-ring]")).toHaveCSS("animation-name", "none");
    release();
    await expect(loader(page)).toHaveCount(0);
  });
});
