// S-218: every account screen in EN and FR at 320/375/1280 px and 200% zoom: axe (light and dark),
// no sideways scroll or clipping, 44 px targets, keyboard order with visible focus. S-217 AC3: no
// tracking cookie and no third-party request on these pages.
import {
  expectKeyboardOperable,
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  expectNothingClipped,
  expectTapTargets,
  withZoom,
} from "./support/a11y";
import { createE2eCustomer, createOrderFor, signInCustomer } from "./support/customer";
import { type Page, expect, test } from "./support/fixtures";

async function sweep(page: Page) {
  for (const zoom of [1, 2]) {
    await withZoom(page, zoom, async () => {
      await expectNoHorizontalScroll(page);
      await expectNothingClipped(page);
      await expectTapTargets(page);
      await expectKeyboardOperable(page);
    });
  }
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await expectNoA11yViolations(page);
  }
}

async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
}

const SIGNED_OUT = ["/account/sign-in", "/account/sign-in?method=link", "/account/sign-up", "/account/reset"];
const SIGNED_IN = ["/account", "/account/orders", "/account/addresses"];

test.describe("S-218 account screens sweep", () => {
  for (const prefix of ["", "/fr"]) {
    test(`AC1, AC3, AC4, AC5 (${prefix || "en"}): signed-out screens`, async ({ page }) => {
      test.slow();
      for (const path of SIGNED_OUT) {
        await open(page, `${prefix}${path}`);
        await sweep(page);
      }
    });

    test(`AC1, AC3, AC4, AC5 (${prefix || "en"}): signed-in screens and Save my details`, async ({ page, db }) => {
      test.slow();
      const customer = await createE2eCustomer(db);
      const order = await createOrderFor(db, `sweep-${Date.now()}@e2e.test`);
      // Sign in first, on the English page (the French pages below remember French afterwards).
      await signInCustomer(page, customer);
      await open(page, `${prefix}/account/save-details?t=${order.trackingToken}`);
      await sweep(page);
      for (const path of SIGNED_IN) {
        await open(page, `${prefix}${path}`);
        await sweep(page);
      }
    });
  }

  test("S-217 AC3: no tracking cookie and no third-party request on the account pages", async ({ page, db, baseURL }) => {
    const origins = new Set<string>();
    page.on("request", (request) => origins.add(new URL(request.url()).origin));
    const customer = await createE2eCustomer(db);
    await open(page, "/account/sign-up");
    await signInCustomer(page, customer);
    await open(page, "/account/orders");
    const names = (await page.context().cookies()).map((c) => c.name);
    for (const name of names) expect(name, "first-party cookies only: language, session, account hint, basket").toMatch(/^(apb_[a-z_]+|sb-[\w-]+)$/);
    expect([...origins].filter((origin) => origin !== new URL(baseURL!).origin)).toEqual([]);
  });
});
