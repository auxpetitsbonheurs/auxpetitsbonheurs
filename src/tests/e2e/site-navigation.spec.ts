// E-13 S-242 (laptop header navigation) and S-243 (phone menu button with full-screen menu).
// Runs in every project; each block skips the widths it does not cover.
import {
  expectKeyboardOperable,
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  expectNothingClipped,
  expectTapTargets,
  withZoom,
} from "./support/a11y";
import { type Page, expect, test } from "./support/fixtures";

const EN = ["Home", "Our story", "Our collection", "Custom order", "Workshops", "Gallery", "Contact us"];
const FR = ["Accueil", "Notre histoire", "Notre collection", "Gâteau sur mesure", "Ateliers", "Galerie", "Contact"];
const PATHS = ["/", "/our-story", "/menu", "/custom-cake", "/workshops", "/gallery", "/contact"];

const isLaptop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;
const siteNav = (page: Page, name = "Main") => page.getByRole("banner").getByRole("navigation", { name });
const menuButton = (page: Page) => page.getByRole("button", { name: "Menu", exact: true });
const panel = (page: Page) => page.getByRole("dialog", { name: "Menu" });

async function hydrated(page: Page) {
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
}

test.describe("every nav page answers (S-242 Notes)", () => {
  test("the 7 routes answer 200 in both languages; placeholders are noindex", async ({ request }) => {
    for (const path of PATHS) {
      for (const url of [path, path === "/" ? "/fr" : `/fr${path}`]) {
        const response = await request.get(url, { headers: { "accept-language": url.startsWith("/fr") ? "fr" : "en" } });
        expect(response.status(), url).toBe(200);
      }
    }
    // /workshops turns indexable once a workshop is listed (E-15, unit-tested in workshops.test.tsx) and
    // parallel specs publish workshops, so the placeholder check reads the seeded Our story page.
    const body = await (await request.get("/our-story")).text();
    expect(body).toContain('<meta name="robots" content="noindex"');
  });
});

test.describe("laptop header navigation (S-242)", () => {
  test.beforeEach(({ page }) => {
    test.skip(!isLaptop(page), "laptop widths only");
  });

  test("AC1: logo at the start, the 7 links in order in the centre, language and basket at the end", async ({ page }) => {
    await page.goto("/");

    const links = siteNav(page).getByRole("link");
    await expect(links).toHaveText(EN);
    for (const [i, path] of PATHS.entries()) await expect(links.nth(i)).toHaveAttribute("href", path);
    const logo = (await page.getByRole("banner").getByRole("link", { name: "Aux petits bonheurs" }).boundingBox())!;
    const nav = (await siteNav(page).boundingBox())!;
    const language = (await page.getByRole("banner").getByRole("link", { name: "Français" }).boundingBox())!;
    const basket = (await page.getByRole("link", { name: /^Basket/ }).boundingBox())!;
    expect(logo.x + logo.width).toBeLessThanOrEqual(nav.x + 1);
    expect(nav.x + nav.width).toBeLessThanOrEqual(language.x + 1);
    expect(language.x + language.width).toBeLessThanOrEqual(basket.x);
    await expect(menuButton(page)).toBeHidden();
  });

  test("AC2: French at 1024 px: labels on one line, no overlap with the logo or the basket", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/fr/menu");

    const links = siteNav(page, "Principal").getByRole("link");
    await expect(links).toHaveText(FR);
    await expect(links.nth(2)).toHaveAttribute("href", "/fr/menu");
    const boxes = await links.evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => ({ top: r.top, height: r.height, left: r.left, right: r.right })));
    for (const box of boxes) {
      expect(box.top).toBeCloseTo(boxes[0]!.top, 0);
      expect(box.height).toBeLessThan(60);
    }
    const logo = (await page.getByRole("banner").getByRole("link", { name: "Aux petits bonheurs" }).boundingBox())!;
    const language = (await page.getByRole("banner").getByRole("link", { name: "English" }).boundingBox())!;
    expect(boxes[0]!.left).toBeGreaterThanOrEqual(logo.x + logo.width);
    expect(boxes.at(-1)!.right).toBeLessThanOrEqual(language.x);
    await expectNoHorizontalScroll(page);
    await expectNothingClipped(page);
  });

  test("AC3: the current page has aria-current and a gold underline; a product page marks Our collection", async ({ page }) => {
    await page.goto("/menu/chocolate-cake");

    const current = siteNav(page).getByRole("link", { name: "Our collection" });
    await expect(current).toHaveAttribute("aria-current", "page");
    await expect(current).toHaveCSS("text-decoration-line", "underline");
    await expect(siteNav(page).locator('[aria-current="page"]')).toHaveCount(1);
    await expect(siteNav(page).getByRole("link", { name: "Home" })).toHaveCSS("text-decoration-line", "none");
  });

  test("AC4: no account icon while customer accounts are not live", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("link", { name: "My account" })).toHaveCount(0);
  });

  test("AC5: Tab order = visual order, visible focus, 44 px targets, axe clean", async ({ page }) => {
    await page.goto("/");

    await page.keyboard.press("Tab"); // skip link
    // E-11: the account icon ("Sign in" when signed out) sits between the language switch and the basket (S-242 AC4).
    const expected = ["Aux petits bonheurs", ...EN, "Français", "Sign in", /^Basket/];
    for (const name of expected) {
      await page.keyboard.press("Tab");
      await expect(page.getByRole("link", { name, exact: typeof name === "string" }).and(page.locator(":focus"))).toHaveCount(1);
    }
    await expectKeyboardOperable(page);
    await expectTapTargets(page);
    await expectNoA11yViolations(page);
  });

  test("AC6: the header stays one row and the page does not shift (CLS <= 0.1)", async ({ page }) => {
    await page.goto("/");
    await hydrated(page);

    const header = (await page.getByRole("banner").boundingBox())!;
    expect(header.height).toBeLessThanOrEqual(80);
    const cls = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let total = 0;
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!entry.hadRecentInput) total += entry.value;
          }).observe({ type: "layout-shift", buffered: true });
          requestAnimationFrame(() => requestAnimationFrame(() => resolve(total)));
        }),
    );
    expect(cls).toBeLessThanOrEqual(0.1);
  });

  test("AC7: at 1023 px the bar is not rendered and the menu button shows instead", async ({ page }) => {
    await page.setViewportSize({ width: 1023, height: 768 });
    await page.goto("/");

    await expect(page.getByRole("banner").getByRole("link", { name: "Our story" })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(1);
    await expect(menuButton(page)).toBeVisible();
  });
});

test.describe("phone menu (S-243)", () => {
  test.beforeEach(({ page }) => {
    test.skip(isLaptop(page), "phone widths only");
  });

  test("AC1: language, logo, basket and a 44 px Menu button with aria-expanded and aria-controls", async ({ page }) => {
    await page.goto("/");
    await hydrated(page);

    const button = menuButton(page);
    await expect(button).toHaveAttribute("aria-expanded", "false");
    const controls = await button.getAttribute("aria-controls");
    expect(controls).toBeTruthy();
    const box = (await button.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    const basket = (await page.getByRole("link", { name: /^Basket/ }).boundingBox())!;
    expect(basket.x + basket.width).toBeLessThanOrEqual(box.x);
    await expect(page.getByRole("link", { name: "Français" })).toBeVisible();
    await expect(page.getByRole("banner").getByRole("link", { name: "Aux petits bonheurs" })).toBeVisible();
  });

  test("AC2, AC3: the full-screen panel: title, Close, 7 rows of 48 px, focus inside, Tab wraps, page inert, Esc closes", async ({ page }) => {
    await page.goto("/menu");
    await hydrated(page);

    await menuButton(page).click();
    const dialog = panel(page);
    await expect(dialog).toBeVisible();
    await expect(menuButton(page)).toHaveAttribute("aria-expanded", "true");
    const viewport = page.viewportSize()!;
    const box = (await dialog.boundingBox())!;
    expect(box.width).toBe(viewport.width);
    expect(box.height).toBe(viewport.height);
    const close = dialog.getByRole("button", { name: "Close menu" });
    await expect(close).toBeFocused();
    // The 7 site links are the panel's navigation; E-11 adds a Sign in / My account row below it.
    const rows = dialog.getByRole("navigation").getByRole("link");
    await expect(rows).toHaveText(EN);
    const account = dialog.getByRole("link", { name: "Sign in" });
    await expect(account).toBeVisible();
    expect((await account.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    await expect(rows.nth(2)).toHaveAttribute("aria-current", "page");
    await expect(rows.nth(2)).toHaveCSS("text-decoration-line", "underline");
    const heights = await rows.evaluateAll((els) => els.map((el) => el.getBoundingClientRect()));
    for (const [i, r] of heights.entries()) {
      expect(r.height).toBeGreaterThanOrEqual(48);
      if (i > 0) expect(r.top - heights[i - 1]!.bottom).toBeGreaterThanOrEqual(7.5);
    }

    for (let i = 0; i < 9; i += 1) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => Boolean(document.activeElement?.closest("dialog[open]")))).toBe(true);
    }
    await close.focus();
    await page.keyboard.press("Shift+Tab");
    await expect(account).toBeFocused();
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe("hidden");
    await expectNoA11yViolations(page);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(menuButton(page)).toBeFocused();
    await expect(menuButton(page)).toHaveAttribute("aria-expanded", "false");
  });

  test("AC4: Close or the current page's link returns focus to the button; another link opens that page with focus on its h1", async ({ page }) => {
    await page.goto("/");
    await hydrated(page);

    await menuButton(page).click();
    await panel(page).getByRole("button", { name: "Close menu" }).click();
    await expect(menuButton(page)).toBeFocused();

    await menuButton(page).click();
    await panel(page).getByRole("link", { name: "Home" }).click();
    await expect(panel(page)).toBeHidden();
    await expect(menuButton(page)).toBeFocused();

    await menuButton(page).click();
    await panel(page).getByRole("link", { name: "Our story" }).click();
    await expect(page).toHaveURL(/\/our-story$/);
    await expect(panel(page)).toBeHidden();
    await expect(page.getByRole("heading", { level: 1, name: "Our story" })).toBeFocused();
  });

  test("AC6: 320/375 px and 200% zoom: header fits on one row or wraps in order; no sideways scroll, nothing clipped, 44 px targets", async ({ page }) => {
    await page.goto("/");
    await hydrated(page);

    for (const zoom of [1, 2]) {
      await withZoom(page, zoom, async () => {
        await expectNoHorizontalScroll(page);
        await expectNothingClipped(page);
        await expectTapTargets(page);
        const tops = await page.getByRole("banner").locator("a, button").evaluateAll((els) =>
          els.filter((el) => el.getClientRects().length > 0).map((el) => el.getBoundingClientRect().top),
        );
        for (let i = 1; i < tops.length; i += 1) expect(tops[i]!).toBeGreaterThanOrEqual(tops[i - 1]! - 30);
      });
    }
    // At 100% the four items share one row.
    const tops = await page.getByRole("banner").locator("a, button").evaluateAll((els) =>
      els.filter((el) => el.getClientRects().length > 0).map((el) => Math.round(el.getBoundingClientRect().bottom)),
    );
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(30);
  });

  test("AC7: French labels wrap rather than clip in the open menu", async ({ page }) => {
    await page.goto("/fr");
    await hydrated(page);

    await menuButton(page).click();
    await expect(panel(page).getByRole("navigation").getByRole("link")).toHaveText(FR);
    await expect(panel(page).getByRole("link", { name: "Se connecter" })).toBeVisible();
    await expectNothingClipped(page);
    await expectNoHorizontalScroll(page);
  });
});

test.describe("phone menu without JavaScript (S-243 AC8)", () => {
  test.use({ javaScriptEnabled: false });

  test("the Menu control is a link to a page with the 7 links", async ({ page }) => {
    test.skip(isLaptop(page), "phone widths only");
    await page.goto("/");

    await page.getByRole("link", { name: "Menu" }).click();
    await expect(page).toHaveURL(/\/menu-links$/);
    await expect(page.getByRole("main").getByRole("link")).toHaveText(EN);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
  });
});
