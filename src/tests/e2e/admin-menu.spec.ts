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

/**
 * Keyboard order through a form. On phone widths the bottom bar leaves while a text field
 * has focus (S-033 AC5), which would renumber the stops mid-walk; it is pinned for the walk.
 */
async function expectFormKeyboardOperable(page: Page) {
  const pin = await page.addStyleTag({ content: "[data-bottom-bar] { display: block !important; }" });
  try {
    await expectKeyboardOperable(page);
  } finally {
    await pin.evaluate((style) => (style as Element).remove());
  }
}

/** No control lies under the sticky Save bar or the bottom bar once scrolled to (focus, as Tab does). */
async function expectBarsHideNothing(page: Page) {
  const hidden = await page.evaluate(() => {
    const bars = [...document.querySelectorAll<HTMLElement>("[data-editor-bar], [data-bottom-bar]")];
    const out: string[] = [];
    for (const control of document.querySelectorAll<HTMLElement>("form input:not([type=hidden]), form textarea")) {
      control.focus();
      const box = (control.closest("label") ?? control).getBoundingClientRect();
      for (const bar of bars) {
        const edge = bar.getBoundingClientRect();
        if (getComputedStyle(bar).position !== "static" && edge.height > 0 && box.bottom > edge.top + 0.5 && box.top < edge.bottom) {
          out.push(`${control.getAttribute("name")} under ${bar.dataset.editorBar === undefined ? "bottom bar" : "Save bar"}`);
        }
      }
    }
    return out;
  });
  expect(hidden, hidden.join("\n")).toEqual([]);
}

test.describe("S-046 product editor", () => {
  test("AC1, AC2, AC11: a new product saves with a Saved toast and stays on its page; numeric price with Rs outside the value", async ({ page }) => {
    await signIn(page, E2E_ACCOUNTS.helper, "/admin/menu/new");
    await hydrated(page);
    const price = page.getByLabel("Base price (Rs)");
    await expect(price).toHaveAttribute("inputmode", "numeric");
    await expect(page.locator("form").getByText("Rs", { exact: true })).toBeVisible();
    const name = `Pistachio cake ${Date.now()}`;

    await page.getByLabel("Name (English)").fill(name);
    await expect(page.getByText("French missing, English will show")).toBeVisible();
    await price.fill("850");
    await page.getByRole("checkbox", { name: "Eggless" }).check();
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/menu\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name: "Edit product" })).toBeVisible();
    await expect(page.getByLabel("Name (English)")).toHaveValue(name);
    await expect(page.getByText(/^Updated by Sarah at \d\d:\d\d$/)).toBeVisible();
  });

  test("AC3: errors mark each field and the error summary takes focus; nothing is saved", async ({ page }) => {
    await signIn(page, E2E_ACCOUNTS.owner, "/admin/menu/new");
    await hydrated(page);
    await page.getByLabel("Base price (Rs)").fill("-3");
    await page.getByLabel(/^Notice days/).fill("90");

    await page.getByRole("button", { name: "Save" }).click();

    const summary = page.getByRole("alert").filter({ hasText: "Please check the product" });
    await expect(summary).toBeFocused();
    await expect(page.getByLabel("Name (English)")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("Base price (Rs)")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel(/^Notice days/)).toHaveAccessibleDescription(/0 to 60/);
    await summary.getByRole("link", { name: "Enter the English name." }).click();
    await expect(page.getByLabel("Name (English)")).toBeFocused();
    await expect(page).toHaveURL(/\/admin\/menu\/new$/);
  });

  test("AC4: blank notice shows the Settings default", async ({ page }) => {
    await signIn(page, E2E_ACCOUNTS.owner, "/admin/menu/new");
    await expect(page.getByLabel(/^Notice days/)).toHaveAttribute("placeholder", "Use default (3)");
  });

  test("AC6: leaving with unsaved changes asks first; after saving it does not", async ({ page, db }) => {
    const product = await createProduct(db, { status: "hidden" });
    await signIn(page, E2E_ACCOUNTS.owner, `/admin/menu/${product.id}`);
    await hydrated(page);
    await page.getByLabel("Name (French)").fill("Gâteau test");

    await page.getByRole("link", { name: "Back to the menu" }).click();
    const dialog = page.getByRole("dialog", { name: "Leave without saving?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Keep editing" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByLabel("Name (French)")).toHaveValue("Gâteau test");

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
    await page.getByRole("link", { name: "Back to the menu" }).click();
    await expect(page).toHaveURL(/\/admin\/menu$/);
  });

  test("AC9: keyboard, focus, 44 px targets, nothing clipped or under the Save bar, at 100% and 200%; names side by side from md", async ({ page, db }) => {
    const product = await createProduct(db, { status: "hidden" });
    await signIn(page, E2E_ACCOUNTS.owner, `/admin/menu/${product.id}`);
    await hydrated(page);
    for (const zoom of [1, 2]) {
      await withZoom(page, zoom, async () => {
        await expectNoHorizontalScroll(page);
        await expectNothingClipped(page);
        await expectTapTargets(page);
        await expectFormKeyboardOperable(page);
        await expectBarsHideNothing(page);
      });
    }
    // Labels, not inputs: the French field may carry a hint line above its input.
    const en = await page.locator('label[for="name-en"]').boundingBox();
    const fr = await page.locator('label[for="name-fr"]').boundingBox();
    if ((page.viewportSize()?.width ?? 0) >= 768) expect(Math.round(fr!.y)).toBe(Math.round(en!.y));
    else expect(fr!.y).toBeGreaterThan(en!.y);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`AC10: labelled fields, errors linked, chips state as text, axe clean in ${colorScheme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await signIn(page, E2E_ACCOUNTS.owner, "/admin/menu/new");
      await hydrated(page);
      await expectNoA11yViolations(page);
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByRole("alert").filter({ hasText: "Please check the product" })).toBeFocused();
      await expect(page.getByLabel("Name (English)")).toHaveAccessibleDescription("Enter the English name.");
      await expectNoA11yViolations(page);
    });
  }
});
