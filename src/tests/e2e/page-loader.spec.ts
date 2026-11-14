// S-317 (replaces S-284): the branded full-screen page loader on customer pages. Every page
// change shows the cream veil with the Owner's badge and the gold whisk stirring, at once, for at
// least 450 ms, then fades out; never on the first load; reduced motion keeps it still; full page
// loads before React starts are covered by the inline script, and a back/forward-cache restore
// hides it. Page data requests (`*.data`) are held or answered from a recording so the timing
// does not depend on the machine's speed.
import { expectNoA11yViolations } from "./support/a11y";
import type { Route } from "@playwright/test";
import { type Page, expect, test } from "./support/fixtures";

const veil = (page: Page) => page.locator("[data-page-loader-veil]");
const loading = (page: Page, text = "Loading…") => page.getByRole("status").filter({ hasText: text });
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

/** Records, from the first paint on, each time the veil is shown or hidden (ms since navigation start). */
async function recordVeil(page: Page) {
  await page.addInitScript(() => {
    const log: [string, number][] = [];
    (window as unknown as { __veil: typeof log }).__veil = log;
    new MutationObserver(() => {
      const shown = document.querySelector("[data-page-loader-veil]")?.hasAttribute("data-show") ?? false;
      const last = log.at(-1)?.[0];
      if ((shown ? "show" : "hide") !== (last ?? "hide")) log.push([shown ? "show" : "hide", performance.now()]);
    }).observe(document, { attributes: true, subtree: true, attributeFilter: ["data-show"], childList: true });
  });
  return () => page.evaluate(() => (window as unknown as { __veil: [string, number][] }).__veil);
}

test.describe("page loader (S-317)", () => {
  test("AC1, AC3, AC6: a page change shows the cream veil, the badge and the stirring whisk, Loading…, axe clean; it goes when the page is ready", async ({ page }) => {
    await open(page, "/");
    await expect(veil(page)).toBeHidden();
    const release = await holdPageData(page);

    await footer(page).getByRole("link", { name: "Our story" }).click();
    await expect(veil(page)).toBeVisible();
    await expect(loading(page)).toBeAttached();
    await expect(veil(page)).toHaveAttribute("aria-hidden", "true");
    await expect(veil(page)).toHaveCSS("background-color", "rgb(251, 243, 232)");
    await expect(veil(page)).toHaveCSS("position", "fixed");
    const badge = veil(page).locator("img");
    await expect.poll(() => badge.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
    const box = (await badge.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(160);
    expect(box.width).toBeLessThanOrEqual(200);
    await expect(page.locator("[data-loader-stir]")).toHaveCSS("animation-name", "loader-stir");
    await expect(page.locator("[data-loader-heart]")).toHaveCSS("animation-name", "loader-heart");
    if (test.info().project.name === "phone-375") await page.screenshot({ path: "test-results/logo-loader-shown-375.png" });
    await expectNoA11yViolations(page);

    release();
    await expect(page).toHaveURL(/\/our-story$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(veil(page)).toBeHidden();
    await expect(loading(page)).toHaveCount(0);
  });

  test("AC3: French text Chargement…", async ({ page }) => {
    await open(page, "/fr");
    const release = await holdPageData(page);
    await footer(page).getByRole("link", { name: "Notre histoire" }).click();
    await expect(loading(page, "Chargement…")).toBeAttached();
    release();
    await expect(page).toHaveURL(/\/fr\/our-story$/);
    await expect(veil(page)).toBeHidden();
  });

  test("AC2, AC4: never on the first load; a fast page change still shows it, for at least 450 ms, then it fades", async ({ page }) => {
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

    const log = await recordVeil(page);
    await open(page, "/");
    expect(await log()).toEqual([]); // first load and hydration: never shown

    await footer(page).getByRole("link", { name: "Our story" }).click();
    await expect(page).toHaveURL(/\/our-story$/);
    await expect(veil(page)).toBeHidden();
    const [shown, hidden] = await log();
    expect(shown?.[0]).toBe("show");
    expect(hidden?.[0]).toBe("hide");
    const visibleMs = hidden![1] - shown![1];
    // 450 ms by the flag's clock; the DOM changes each trail it by a render (a few ms either way).
    expect(visibleMs).toBeGreaterThanOrEqual(420);
    expect(visibleMs).toBeLessThan(1_500);
  });

  test("AC4: reduced motion: the badge, whisk and heart stay still", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, "/");
    const release = await holdPageData(page);
    await footer(page).getByRole("link", { name: "Our story" }).click();
    await expect(veil(page)).toBeVisible();
    await expect(page.locator("[data-loader-stir]")).toHaveCSS("animation-name", "none");
    await expect(page.locator("[data-loader-tilt]")).toHaveCSS("animation-name", "none");
    await expect(page.locator("[data-loader-heart]")).toHaveCSS("animation-name", "none");
    await expect(page.locator("[data-loader-heart]")).toHaveCSS("opacity", "1");
    release();
    await expect(veil(page)).toBeHidden();
  });

  test("AC5: before React starts, a tap is a full page load and the inline script shows the loader; a back/forward restore hides it", async ({ page }) => {
    // No app JavaScript at all: every link is a plain navigation (what an early tap is).
    await page.route(/\/assets\/.*\.js$/, (route) => route.abort());
    // The next page answers 204 No Content: the browser stays on this page (as for a download),
    // so the overlay the script showed for the full page load can be read here.
    await page.route(/\/our-story$/, (route) => route.fulfill({ status: 204 }));
    await page.goto("/");
    await expect(veil(page)).toBeHidden();

    await footer(page).getByRole("link", { name: "Our story" }).click();
    await expect(veil(page)).toBeVisible();
    await expect(loading(page)).toBeAttached();
    await expect(veil(page).locator("img")).toHaveAttribute("srcset", /badge-cream-plain-200\.webp/);

    // A page restored from the back/forward cache comes back with the loader hidden.
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
    await expect(veil(page)).toBeHidden();
    await expect(loading(page)).toHaveCount(0);
  });

  test("AC5: a full page load really happens behind it (no React): the next page arrives without the loader", async ({ page }) => {
    await page.route(/\/assets\/.*\.js$/, (route) => route.abort());
    await page.goto("/");
    await footer(page).getByRole("link", { name: "Our story" }).click();
    await expect(page).toHaveURL(/\/our-story$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(veil(page)).toBeHidden();
  });

  test("AC5: the script leaves same-page anchors, phone links and new tabs alone (the page stays)", async ({ page, context }) => {
    await page.route(/\/assets\/.*\.js$/, (route) => route.abort());
    await page.goto("/");
    const popup = context.waitForEvent("page");
    // Real, unprevented clicks on links that do not leave this page.
    const shownAfter = await page.evaluate(async () => {
      const add = (href: string, target?: string) => {
        const a = Object.assign(document.createElement("a"), { href, textContent: href });
        if (target) a.target = target;
        document.body.appendChild(a);
        return a;
      };
      add("#main").click();
      add("tel:+23050000000").click();
      add("/menu", "_blank").click();
      // The script decides in a 0 ms timeout after each click: two frames later it has.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return document.querySelector("[data-page-loader-veil]")!.hasAttribute("data-show");
    });
    expect(shownAfter).toBe(false);
    await (await popup).close();
    await expect(veil(page)).toBeHidden();
  });
});
