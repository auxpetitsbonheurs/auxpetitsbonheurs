// S-033 admin frame: header with page title and role, one-handed bottom bar, More,
// "Not available yet" destinations; keyboard, zoom, tap targets and axe.
import {
  expectKeyboardOperable,
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  expectNothingClipped,
  expectTapTargets,
  withZoom,
} from "./support/a11y";
import { signIn } from "./support/admin";
import { E2E_ACCOUNTS, createOrder } from "./support/database";
import { type Page, expect, test } from "./support/fixtures";

const bar = (page: Page) => page.getByRole("navigation", { name: "Admin" });
const hydrated = (page: Page) => expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");

/** Each label is fully shown: nothing overflows its box. */
async function expectLabelsFit(page: Page) {
  const overflowing = await bar(page)
    .locator("a [data-bar-label]")
    .evaluateAll((spans) => spans.filter((s) => s.scrollWidth > s.clientWidth + 1 || s.getBoundingClientRect().right > window.innerWidth).map((s) => s.textContent));
  expect(overflowing).toEqual([]);
}

test.describe("S-033 admin frame", () => {
  test("AC1: at 375 px the bar has Today, Orders, Calendar, Menu, More, the current one marked, columns >= 44 x 56 px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await signIn(page, E2E_ACCOUNTS.owner, "/admin");

    const links = bar(page).getByRole("link");
    // Orders may carry the review count (S-034): its dot number and "N to review".
    await expect(links).toHaveText(["Today", /Orders/, "Calendar", "Menu", "More"]);
    await expect(bar(page).getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
    await expect(bar(page).locator('[aria-current="page"]')).toHaveCount(1);
    for (const box of await links.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON() as DOMRect))) {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(56);
    }
    const nav = await bar(page).boundingBox();
    expect(Math.round(nav!.y + nav!.height)).toBe(667);

    await bar(page).getByRole("link", { name: "Orders" }).click();
    await expect(page).toHaveURL(/\/admin\/orders\?tab=review$/);
    await expect(bar(page).getByRole("link", { name: "Orders" })).toHaveAttribute("aria-current", "page");
    await expect(bar(page).getByRole("link", { name: "Today" })).not.toHaveAttribute("aria-current", /.+/);
  });

  test("AC2: in French at 320 px the labels Aujourd'hui, Commandes, Calendrier, Carte, Plus are fully visible", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await signIn(page, E2E_ACCOUNTS.french, "/admin");

    await expect(bar(page).getByRole("link")).toHaveText(["Aujourd'hui", /Commandes/, "Calendrier", "Carte", "Plus"]);
    await expectLabelsFit(page);
    await expectNoHorizontalScroll(page);
  });

  test("AC3: an Owner's More lists everyone's places and Availability, Settings, Team; Team opens /admin/team", async ({ page }) => {
    await signIn(page, E2E_ACCOUNTS.owner, "/admin");
    await bar(page).getByRole("link", { name: "More" }).click();
    await expect(page).toHaveURL(/\/admin\/more$/);
    await expect(page.getByRole("heading", { level: 1, name: "More" })).toBeVisible();
    const main = page.getByRole("main");
    for (const name of ["Gallery", "Customers", "Sales summary", "My profile", "Availability", "Settings", "Team"]) {
      await expect(main.getByRole("link", { name })).toBeVisible();
    }
    await expect(main.getByRole("button", { name: "Sign out" })).toBeVisible();
    await main.getByRole("link", { name: "Team" }).click();
    await expect(page).toHaveURL(/\/admin\/team$/);
    await expect(page.getByRole("heading", { level: 1, name: "Team" })).toBeVisible();
    await expect(bar(page).getByRole("link", { name: "More" })).toHaveAttribute("aria-current", "true");
  });

  test("AC4: an Admin's More has no Owner items, and typing their address gives Owner only", async ({ page }) => {
    await signIn(page, E2E_ACCOUNTS.helper, "/admin/more");
    const main = page.getByRole("main");
    await expect(main.getByRole("link", { name: "Gallery" })).toBeVisible();
    for (const name of ["Availability", "Settings", "Team"]) await expect(main.getByRole("link", { name })).toHaveCount(0);
    await expect(main.getByText("For Owners")).toHaveCount(0);
    await expect(main.getByRole("button", { name: "Sign out" })).toBeVisible();

    await page.goto("/admin/team");
    await expect(page.getByRole("heading", { level: 1, name: "Owner only" })).toBeVisible();
    await expect(bar(page)).toBeVisible();
  });

  test("AC5: the bar hides while a text field has focus (keyboard open) or a full-screen sheet shows, and comes back", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await signIn(page, E2E_ACCOUNTS.owner, "/admin");
    await hydrated(page);
    await page.evaluate(() => {
      const field = document.createElement("input");
      field.setAttribute("aria-label", "Test field");
      document.querySelector("main")!.insertAdjacentElement("beforeend", field);
    });

    await page.getByLabel("Test field").focus();
    await expect(bar(page)).toBeHidden();
    await page.getByLabel("Test field").blur();
    await expect(bar(page)).toBeVisible();

    await page.evaluate(() => (document.documentElement.dataset.sheetOpen = ""));
    await expect(bar(page)).toBeHidden();
    await page.evaluate(() => delete document.documentElement.dataset.sheetOpen);
    await expect(bar(page)).toBeVisible();
  });

  test("AC6: the header shows the page title and the role as text", async ({ page }) => {
    await signIn(page, E2E_ACCOUNTS.owner, "/admin/orders");
    const header = page.getByRole("banner");
    await expect(header.getByText("Orders", { exact: true })).toBeVisible();
    await expect(header).toContainText("Owner");

    await page.context().clearCookies();
    await signIn(page, E2E_ACCOUNTS.helper, "/admin/calendar");
    await expect(page.getByRole("banner").getByText("Calendar", { exact: true })).toBeVisible();
    await expect(page.getByRole("banner")).toContainText("Admin");
  });

  test("AC7: Calendar, Customers and Gallery show Not available yet inside the frame; Today links to orders to review", async ({ page }) => {
    await signIn(page, E2E_ACCOUNTS.owner, "/admin");
    await expect(page.getByRole("main").getByRole("link", { name: "Orders to review" })).toHaveAttribute("href", "/admin/orders?tab=review");
    for (const [path, title] of [
      ["/admin/calendar", "Calendar"],
      ["/admin/customers", "Customers"],
      ["/admin/gallery", "Gallery"],
    ] as const) {
      const response = await page.goto(path);
      expect(response!.status(), path).toBe(200);
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(page.getByText("Not available yet")).toBeVisible();
      await expect(page.getByRole("link", { name: "Back to Today" })).toBeVisible();
      await expect(bar(page)).toBeVisible();
    }
    // The Sales summary is built (E-09): its own page inside the frame, not the placeholder.
    expect((await page.goto("/admin/sales"))!.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Sales summary" })).toBeVisible();
    await expect(page.getByRole("tablist", { name: "Period" })).toBeVisible();
    await expect(page.getByText("Not available yet")).toHaveCount(0);
    await expect(bar(page)).toBeVisible();
  });

  test("AC8: skip link jumps past the bar; keyboard order, visible focus, no clipping or sideways scroll, 44 px targets at 100% and 200%", async ({ page }) => {
    await signIn(page, E2E_ACCOUNTS.owner, "/admin/more");
    // A fresh load, so the first Tab starts from the top of the page (not from the sign-in button).
    await page.goto("/admin/more");
    await hydrated(page);

    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    // E-14: Reviews is the first More row (then Pages).
    await expect(page.getByRole("main").getByRole("link", { name: "Reviews" })).toBeFocused();

    for (const path of ["/admin", "/admin/more"]) {
      await page.goto(path);
      await hydrated(page);
      for (const zoom of [1, 2]) {
        await withZoom(page, zoom, async () => {
          await expectNoHorizontalScroll(page);
          await expectNothingClipped(page);
          await expectTapTargets(page);
          await expectKeyboardOperable(page);
          await expectLabelsFit(page);
        });
      }
    }
  });

  test("S-034 AC1, AC6: Orders shows a count dot named 'N to review', not clipped, 44 px target, at 320 px and 200%", async ({ page, db }) => {
    await createOrder(db, "Badge check");
    await page.setViewportSize({ width: 320, height: 640 });
    await signIn(page, E2E_ACCOUNTS.helper, "/admin/more");
    await hydrated(page);

    const orders = bar(page).getByRole("link", { name: /^Orders\s*,\s*\d+ to review$/ });
    await expect(orders).toBeVisible();
    const dot = orders.locator("[data-review-dot]");
    await expect(dot).toHaveText(/^([1-9]|9\+)$/);
    for (const zoom of [1, 2]) {
      await withZoom(page, zoom, async () => {
        const link = (await orders.boundingBox())!;
        const mark = (await dot.boundingBox())!;
        expect(link.width).toBeGreaterThanOrEqual(44);
        expect(link.height).toBeGreaterThanOrEqual(44);
        // The dot sits inside its column: never clipped, never off screen.
        expect(mark.x).toBeGreaterThanOrEqual(link.x - 0.5);
        expect(mark.x + mark.width).toBeLessThanOrEqual(link.x + link.width + 0.5);
        expect(mark.y).toBeGreaterThanOrEqual(link.y - 0.5);
        await expectNothingClipped(page);
        await expectNoHorizontalScroll(page);
      });
    }
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await expectNoA11yViolations(page);
    }
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`AC9: axe clean in ${colorScheme} mode with labelled icons; reduced motion removes transitions`, async ({ page }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await signIn(page, E2E_ACCOUNTS.owner, "/admin");
      await expectNoA11yViolations(page);
      for (const icon of await bar(page).locator("svg").all()) await expect(icon).toHaveAttribute("aria-hidden", "true");
      const duration = await bar(page).getByRole("link", { name: "Orders" }).evaluate((el) => getComputedStyle(el).transitionDuration);
      expect(duration).toBe("0s");
      await page.goto("/admin/more");
      await expectNoA11yViolations(page);
      await expectNoA11yViolations(page, { zoom: 2 });
      await page.goto("/admin/gallery");
      await expectNoA11yViolations(page);
    });
  }
});
