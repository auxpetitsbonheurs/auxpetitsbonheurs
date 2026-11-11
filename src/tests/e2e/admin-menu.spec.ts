// E-03 admin menu: list (S-041), editor (S-046), hide / sold out (S-043), delete (S-045).
// Every spec makes its own products (unique names), so parallel projects never share one.
import {
  expectKeyboardOperable,
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  expectNothingClipped,
  expectTapTargets,
  withZoom,
} from "./support/a11y";
import { signIn } from "./support/admin";
import { createProduct } from "./support/catalogue";
import { E2E_ACCOUNTS } from "./support/database";
import { type Page, expect, test } from "./support/fixtures";

const hydrated = (page: Page) => expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
const bar = (page: Page) => page.getByRole("navigation", { name: "Admin" });
/** The menu grows as specs add products; Tab through all of it. */
const MENU_TAB_LIMIT = 400;

test.describe("S-041 menu list", () => {
  test("AC1, AC7: rows show photo, name, from-price and tags as text, under one heading per type; each actions button is named", async ({ page, db }) => {
    const sold = await createProduct(db, { name: "Lemon cake", status: "sold_out", priceRs: 900 });
    const hidden = await createProduct(db, { name: "Secret box", type: "cupcake_box", status: "hidden", photo: false });
    await signIn(page, E2E_ACCOUNTS.helper, "/admin/menu");

    for (const name of ["Cakes", "Cupcake boxes", "Desserts", "Seasonal"]) {
      await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
    }
    const soldRow = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: sold.name }) });
    await expect(soldRow).toContainText("from Rs 900");
    await expect(soldRow).toContainText("Sold out");
    await expect(soldRow.getByRole("img")).toHaveCount(0); // decorative photo: alt=""
    await expect(soldRow.locator("img")).toHaveAttribute("alt", "");
    const hiddenRow = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: hidden.name }) });
    await expect(hiddenRow).toContainText("Hidden");
    await expect(page.getByRole("button", { name: `Actions for ${sold.name}` })).toBeVisible();
    await expect(page.getByRole("button", { name: `Actions for ${hidden.name}` })).toBeVisible();
  });

  test("AC3: a slow load shows row skeletons after 300 ms, then the list", async ({ page, db }) => {
    const product = await createProduct(db);
    await signIn(page, E2E_ACCOUNTS.owner, "/admin");
    await hydrated(page);
    // The data is held back until the skeleton has shown (no fixed sleep).
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/admin/menu.data*", async (route) => {
      await held;
      await route.continue();
    });

    await bar(page).getByRole("link", { name: "Menu" }).click();

    await expect(page.getByTestId("menu-skeleton")).toBeVisible();
    release();
    await expect(page.getByRole("link", { name: product.name })).toBeVisible();
    await expect(page.getByTestId("menu-skeleton")).toHaveCount(0);
  });

  test("AC3: a load failure shows an Alert with Retry, and Retry loads the list", async ({ page, db }) => {
    const product = await createProduct(db);
    await signIn(page, E2E_ACCOUNTS.owner, "/admin");
    await hydrated(page);
    await page.route("**/admin/menu.data*", (route) => route.fulfill({ status: 500, body: "down" }));

    await bar(page).getByRole("link", { name: "Menu" }).click();

    const alert = page.getByRole("alert").filter({ hasText: "The menu did not load" });
    await expect(alert).toBeVisible();
    await page.unroute("**/admin/menu.data*");
    await alert.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("link", { name: product.name })).toBeVisible();
  });

  test("AC6: keyboard, visible focus, no clipping or sideways scroll and 44 px targets, at 100% and 200%", async ({ page, db }) => {
    await createProduct(db, { name: "A cake with a rather long name to wrap on small phones", status: "sold_out" });
    await signIn(page, E2E_ACCOUNTS.owner, "/admin/menu");
    await hydrated(page);
    for (const zoom of [1, 2]) {
      await withZoom(page, zoom, async () => {
        await expectNoHorizontalScroll(page);
        await expectNothingClipped(page);
        await expectTapTargets(page);
        await expectKeyboardOperable(page, MENU_TAB_LIMIT);
      });
    }
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`AC7: no serious or critical axe violations in ${colorScheme} mode, list and actions sheet`, async ({ page, db }) => {
      const product = await createProduct(db, { status: "sold_out" });
      await page.emulateMedia({ colorScheme });
      await signIn(page, E2E_ACCOUNTS.owner, "/admin/menu");
      await hydrated(page);
      await expectNoA11yViolations(page);
      await page.getByRole("button", { name: `Actions for ${product.name}` }).click();
      await expect(page.getByRole("dialog", { name: product.name })).toBeVisible();
      await expectNoA11yViolations(page);
    });
  }

  test("AC8: in French the groups and tags are French and names fall back to English", async ({ page, db }) => {
    const product = await createProduct(db, { status: "hidden" });
    await signIn(page, E2E_ACCOUNTS.french, "/admin/menu");

    await expect(page.getByRole("heading", { level: 1, name: "Carte" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Boîtes de cupcakes" })).toBeVisible();
    const row = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: product.name }) });
    await expect(row).toContainText("Masqué");
  });
});
