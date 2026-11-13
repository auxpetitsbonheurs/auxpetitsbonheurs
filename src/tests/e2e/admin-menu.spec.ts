// E-03 admin menu: list (S-041), reorder (S-042), editor (S-046), hide / sold out (S-043), delete (S-045),
// photos (S-047), option groups (S-048), seasonal dates (S-049), preview (S-051). Every spec makes its own products (unique names), so parallel projects
// never share one.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  expectKeyboardOperable,
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  expectNothingClipped,
  expectTapTargets,
  withZoom,
} from "./support/a11y";
import { signIn } from "./support/admin";
import { addOptionGroups, createProduct } from "./support/catalogue";
import { E2E_ACCOUNTS } from "./support/database";
import { devices } from "@playwright/test";
import { type Page, expect, test } from "./support/fixtures";

const hydrated = (page: Page) => expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
const bar = (page: Page) => page.getByRole("navigation", { name: "Admin" });
/** The menu grows as specs add products; Tab through all of it. */
const MENU_TAB_LIMIT = 700;

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
    // Tabs through the whole shared menu twice; it grows with every spec's products (timed out
    // once at 30 s under the full parallel suite), so it gets the slow-test budget.
    test.slow();
    const long = await createProduct(db, { name: "A cake with a rather long name to wrap on small phones", status: "sold_out" });
    await signIn(page, E2E_ACCOUNTS.owner, "/admin/menu");
    await hydrated(page);
    // Sign-in lands by a client navigation: the URL changes before the (long) list has
    // rendered, and Tab presses during that render lost focus on CI. Wait for the list.
    await expect(page.getByRole("link", { name: long.name })).toBeVisible();
    for (const zoom of [1, 2]) {
      await withZoom(page, zoom, async () => {
        await expectNoHorizontalScroll(page);
        await expectNothingClipped(page);
        await expectTapTargets(page);
        // Hundreds of stops: the batched walk (same checks, one read per 40 presses; was 48 s).
        await expectKeyboardOperable(page, MENU_TAB_LIMIT, { batched: true });
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
async function expectFormKeyboardOperable(page: Page, limit?: number) {
  const pin = await page.addStyleTag({ content: "[data-bottom-bar] { display: block !important; }" });
  try {
    await expectKeyboardOperable(page, limit);
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

  test("review: a slow editor load shows the form skeleton, then the form", async ({ page, db }) => {
    const product = await createProduct(db, { status: "hidden" });
    await signIn(page, E2E_ACCOUNTS.owner, "/admin/menu");
    await hydrated(page);
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(`**/admin/menu/${product.id}.data*`, async (route) => {
      await held;
      await route.continue();
    });

    await page.getByRole("link", { name: product.name }).click();

    await expect(page.getByTestId("form-skeleton")).toBeVisible();
    release();
    await expect(page.getByLabel("Name (English)")).toHaveValue(product.name);
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

const rowOf = (page: Page, name: string) => page.getByRole("listitem").filter({ has: page.getByRole("link", { name }) });

async function openActions(page: Page, name: string) {
  await page.getByRole("button", { name: `Actions for ${name}` }).click();
  const sheet = page.getByRole("dialog", { name });
  await expect(sheet).toBeVisible();
  return sheet;
}

test.describe("S-043 hide or mark sold out", () => {
  test("AC1: Mark sold out confirms in a toast, the row says Sold out and the customer page has no Add button", async ({ page, db }) => {
    const product = await createProduct(db);
    await signIn(page, E2E_ACCOUNTS.helper, "/admin/menu");
    await hydrated(page);

    await (await openActions(page, product.name)).getByRole("button", { name: "Mark sold out" }).click();

    await expect(page.getByRole("status").filter({ hasText: `${product.name} is marked sold out.` })).toBeVisible();
    await expect(rowOf(page, product.name)).toContainText("Sold out");
    await page.goto(`/menu/${product.slug}`);
    await expect(page.getByText("Sold out this week", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add to basket" })).toHaveCount(0);
  });

  test("AC2, AC3: Hide makes the product URL a 404; Show brings it back", async ({ page, db }) => {
    const product = await createProduct(db);
    await signIn(page, E2E_ACCOUNTS.owner, "/admin/menu");
    await hydrated(page);

    await (await openActions(page, product.name)).getByRole("button", { name: "Hide" }).click();
    await expect(rowOf(page, product.name)).toContainText("Hidden");
    await expect(page.getByRole("status").filter({ hasText: "is hidden from customers" })).toBeVisible();
    expect((await page.request.get(`/menu/${product.slug}`)).status()).toBe(404);

    await (await openActions(page, product.name)).getByRole("button", { name: "Show on the menu" }).click();
    await expect(page.getByRole("status").filter({ hasText: `${product.name} is available again.` })).toBeVisible();
    await expect(rowOf(page, product.name)).not.toContainText("Hidden");
    expect((await page.request.get(`/menu/${product.slug}`)).status()).toBe(200);
  });

  test("AC4: Show on a product with no photo is refused with \"Add a photo first\" and the row stays Hidden", async ({ page, db }) => {
    const product = await createProduct(db, { status: "hidden", photo: false });
    await signIn(page, E2E_ACCOUNTS.owner, "/admin/menu");
    await hydrated(page);

    await (await openActions(page, product.name)).getByRole("button", { name: "Show on the menu" }).click();

    await expect(rowOf(page, product.name)).toContainText("Add a photo first");
    await expect(rowOf(page, product.name)).toContainText("Hidden");
    await expect(page.getByRole("status").filter({ hasText: `${product.name} was not changed.` })).toBeVisible();
  });

  test("AC8: the sheet by keyboard: focus moves in, Esc closes and focus returns; targets, zoom and the announced state", async ({ page, db }) => {
    const product = await createProduct(db);
    await signIn(page, E2E_ACCOUNTS.owner, "/admin/menu");
    await hydrated(page);
    const trigger = page.getByRole("button", { name: `Actions for ${product.name}` });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const sheet = page.getByRole("dialog", { name: product.name });
    await expect(sheet).toBeVisible();
    for (const zoom of [1, 2]) {
      await withZoom(page, zoom, async () => {
        await expectNoHorizontalScroll(page);
        await expectTapTargets(page);
      });
    }
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(trigger).toBeFocused();

    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab"); // close button
    await page.keyboard.press("Tab"); // Edit
    await page.keyboard.press("Tab"); // Mark sold out
    await expect(sheet.getByRole("button", { name: "Mark sold out" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status").filter({ hasText: "is marked sold out" })).toBeVisible();
    await expect(rowOf(page, product.name)).toContainText("Sold out");
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`AC8: the row sheet has no serious or critical axe violations in ${colorScheme} mode, at 100% and 200%`, async ({ page, db }) => {
      const product = await createProduct(db, { status: "sold_out" });
      await page.emulateMedia({ colorScheme });
      await signIn(page, E2E_ACCOUNTS.owner, "/admin/menu");
      await hydrated(page);
      await openActions(page, product.name);
      await expectNoA11yViolations(page);
      await expectNoA11yViolations(page, { zoom: 2 });
    });
  }
});

async function openDelete(page: Page, name: string) {
  await (await openActions(page, name)).getByRole("button", { name: "Delete…" }).click();
  const dialog = page.getByRole("dialog", { name: `Delete ${name}?` });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("S-045 delete a product", () => {
  test("AC2: the dialog names the product and recommends Hide instead; Delete needs its own press", async ({ page, db }) => {
    const product = await createProduct(db);
    await signIn(page, E2E_ACCOUNTS.helper, "/admin/menu");
    await hydrated(page);

    const dialog = await openDelete(page, product.name);
    await expect(dialog).toContainText("hide it instead");
    await expect(dialog.getByRole("button", { name: "Hide instead" })).toBeVisible();
    await expect(rowOf(page, product.name)).toHaveCount(1); // nothing deleted by the first press

    await dialog.getByRole("button", { name: "Delete for good" }).click();

    await expect(page.getByRole("status").filter({ hasText: `${product.name} deleted.` })).toBeVisible();
    await expect(page.getByRole("link", { name: product.name })).toHaveCount(0);
    await expect(page.locator("#main")).toBeFocused(); // its row (the trigger) is gone
    await page.reload();
    await expect(page.getByRole("link", { name: product.name })).toHaveCount(0);
    expect((await page.request.get(`/menu/${product.slug}`)).status()).toBe(404);
  });

  test("AC2: Hide instead hides it and keeps it", async ({ page, db }) => {
    const product = await createProduct(db);
    await signIn(page, E2E_ACCOUNTS.owner, "/admin/menu");
    await hydrated(page);

    await (await openDelete(page, product.name)).getByRole("button", { name: "Hide instead" }).click();

    await expect(rowOf(page, product.name)).toContainText("Hidden");
    await expect(page.getByRole("status").filter({ hasText: "is hidden from customers" })).toBeVisible();
  });

  test("AC7: focus is trapped in the dialog, Esc closes it and focus returns; 44 px targets at 100% and 200%; destructive button has words and an icon", async ({ page, db }) => {
    const product = await createProduct(db);
    await signIn(page, E2E_ACCOUNTS.owner, "/admin/menu");
    await hydrated(page);
    const dialog = await openDelete(page, product.name);
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press("Tab");
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    for (const zoom of [1, 2]) {
      await withZoom(page, zoom, async () => {
        await expectNoHorizontalScroll(page);
        await expectTapTargets(page);
      });
    }
    const destructive = dialog.getByRole("button", { name: "Delete for good" });
    await expect(destructive.locator("svg")).toHaveCount(1);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("link", { name: product.name })).toBeVisible();
    // The sheet that opened the dialog has closed, so focus returns to the page (not lost on a removed node).
    expect(await page.evaluate(() => document.activeElement && document.activeElement !== document.body)).toBe(true);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`AC7: the dialog has no serious or critical axe violations in ${colorScheme} mode, at 100% and 200%`, async ({ page, db }) => {
      const product = await createProduct(db);
      await page.emulateMedia({ colorScheme });
      await signIn(page, E2E_ACCOUNTS.owner, "/admin/menu");
      await hydrated(page);
      await openDelete(page, product.name);
      await expectNoA11yViolations(page);
      await expectNoA11yViolations(page, { zoom: 2 });
    });
  }
});

// ---------------------------------------------------------------------------
// S-047 product photos. Uploads go to the Storage stub (tests/e2e/support/storage-stub.ts).

const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));
const JPEG_WITH_EXIF = `${FIXTURES}cake-exif.jpg`;
const HEIC = `${FIXTURES}cake.heic`;
const STORAGE_STUB = "http://127.0.0.1:54321";

const addPhotos = (page: Page) => page.getByLabel("Add photos");
const photoList = (page: Page) => page.getByRole("list", { name: "Product photos, in order" });
const photoRows = (page: Page) => photoList(page).getByRole("listitem");

/** Every photo row has finished (no "Getting ready" or "Uploading" left). */
async function uploadsSettled(page: Page) {
  await expect(photoList(page).getByText(/Getting the photo ready|Uploading/)).toHaveCount(0, { timeout: 30_000 });
}

async function storedPhotos(db: Parameters<typeof createProduct>[0], productId: string) {
  return db<{ storage_path: string; width: number; height: number }[]>`
    select storage_path, width, height from product_photo where product_id = ${productId} order by sort_order`;
}

async function storedBytes(path: string): Promise<Buffer> {
  const response = await fetch(`${STORAGE_STUB}/__storage/object?path=${encodeURIComponent(path)}`);
  expect(response.status).toBe(200);
  return Buffer.from(await response.arrayBuffer());
}

async function productIdFromUrl(page: Page): Promise<string> {
  await expect(page).toHaveURL(/\/admin\/menu\/[0-9a-f-]{36}$/);
  return /\/admin\/menu\/([0-9a-f-]{36})$/.exec(page.url())![1]!;
}

async function newProductWithName(page: Page, name: string) {
  await signIn(page, E2E_ACCOUNTS.owner, "/admin/menu/new");
  await hydrated(page);
  await page.getByLabel("Name (English)").fill(name);
  await page.getByLabel("Base price (Rs)").fill("900");
}

test.describe("S-047 product photos", () => {
  test("AC1, AC8: a JPEG is shrunk to WebP within 1600 px and 300 kB with EXIF removed; the compression code loads only when a photo is chosen", async ({ page, db }) => {
    const chunks: string[] = [];
    page.on("request", (request) => chunks.push(request.url()));
    const name = `Photo cake ${Date.now()}`;
    await newProductWithName(page, name);
    expect(chunks.filter((url) => /image-compress/.test(url))).toEqual([]);

    await addPhotos(page).setInputFiles(JPEG_WITH_EXIF);
    await uploadsSettled(page);
    expect(chunks.some((url) => /image-compress/.test(url))).toBe(true);
    await expect(photoRows(page)).toHaveCount(1);
    await expect(photoRows(page).getByRole("img", { name })).toBeVisible();
    await page.getByRole("radio", { name: "Available" }).check();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();

    const [stored] = await storedPhotos(db, await productIdFromUrl(page));
    expect(stored).toMatchObject({ width: 1600, height: 1200 });
    const bytes = await storedBytes(stored!.storage_path);
    expect(bytes.length).toBeLessThanOrEqual(307_200);
    expect(bytes.subarray(0, 4).toString("latin1")).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString("latin1")).toBe("WEBP");
    expect(bytes.includes(Buffer.from("E2E-CAMERA"))).toBe(false);
    expect(bytes.includes(Buffer.from("Exif"))).toBe(false);
  });

  test("S-276 AC1, AC2, AC3: the 480 and 960 px WebP copies are stored beside the photo, recorded on save and served as srcset", async ({ page, db }) => {
    const name = `Sized cake ${Date.now()}`;
    await newProductWithName(page, name);
    await addPhotos(page).setInputFiles(JPEG_WITH_EXIF);
    await uploadsSettled(page);
    await page.getByRole("radio", { name: "Available" }).check();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();

    const productId = await productIdFromUrl(page);
    const [row] = await db<{ storage_path: string; variant_widths: number[] }[]>`select storage_path, variant_widths from product_photo where product_id = ${productId}`;
    expect(row!.variant_widths).toEqual([480, 960]);
    for (const width of [480, 960]) {
      const copy = await storedBytes(row!.storage_path.replace(/\.webp$/, `-${width}w.webp`));
      expect(copy.subarray(8, 12).toString("latin1")).toBe("WEBP");
      expect(copy.includes(Buffer.from("E2E-CAMERA"))).toBe(false);
      expect(copy.length).toBeLessThan((await storedBytes(row!.storage_path)).length);
    }

    const [slug] = await db<{ slug: string }[]>`select slug from product where id = ${productId}`;
    await page.goto(`/menu/${slug!.slug}`);
    const photo = page.getByRole("img", { name }).first();
    await expect(photo).toHaveAttribute("srcset", new RegExp(`-480w\\.webp 480w, .*-960w\\.webp 960w, .*\\.webp 1600w$`));
    await expect(photo).toHaveAttribute("sizes", /90vw, 20rem$/);
  });

  test("AC1: a HEIC photo is converted in the browser and stored as WebP", async ({ page, db }) => {
    test.slow(); // the HEIC decoder is a large download, fetched only for HEIC files
    const name = `Heic cake ${Date.now()}`;
    await newProductWithName(page, name);

    await addPhotos(page).setInputFiles(HEIC);
    await uploadsSettled(page);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();

    const [stored] = await storedPhotos(db, await productIdFromUrl(page));
    expect(stored).toMatchObject({ width: 1600, height: 1200 });
    const bytes = await storedBytes(stored!.storage_path);
    expect(bytes.subarray(8, 12).toString("latin1")).toBe("WEBP");
    expect(bytes.length).toBeLessThanOrEqual(307_200);
  });

  test("AC2: a PDF and a photo over 10 MB are refused with a plain message and nothing is sent", async ({ page }) => {
    await newProductWithName(page, `Refused ${Date.now()}`);
    const sent: string[] = [];
    page.on("request", (request) => {
      if (request.method() !== "GET") sent.push(request.url());
    });

    await addPhotos(page).setInputFiles([
      { name: "menu.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\n") },
      { name: "huge.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(10 * 1_048_576 + 1, 0xff) },
    ]);

    await expect(page.getByText("menu.pdf is not a photo we can use. Choose a JPEG, PNG, WebP or HEIC photo.")).toBeVisible();
    await expect(page.getByText("huge.jpg is over 10 MB. Choose a smaller photo.")).toBeVisible();
    await expect(photoRows(page)).toHaveCount(0);
    expect(sent).toEqual([]);
  });

  test("AC4: with 5 photos the add control is disabled and says why", async ({ page, db }) => {
    const product = await createProduct(db, { photos: 5, status: "hidden" });
    await signIn(page, E2E_ACCOUNTS.owner, `/admin/menu/${product.id}`);
    await hydrated(page);

    await expect(photoRows(page)).toHaveCount(5);
    await expect(addPhotos(page)).toBeDisabled();
    await expect(addPhotos(page)).toHaveAccessibleDescription("This product has 5 photos, the most it can have. Remove one to add another.");
  });

  test("AC5, AC9: Move buttons reorder (the first is the main photo), Remove renumbers, each change is announced and saved", async ({ page, db }) => {
    const product = await createProduct(db, { photos: 3, status: "hidden" });
    const before = await storedPhotos(db, product.id);
    await signIn(page, E2E_ACCOUNTS.owner, `/admin/menu/${product.id}`);
    await hydrated(page);
    await expect(page.getByRole("button", { name: "Move photo 1 earlier" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Move photo 3 later" })).toBeDisabled();

    await page.getByRole("button", { name: "Move photo 3 earlier" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Photo moved to position 2 of 3." })).toBeAttached();
    await page.getByRole("button", { name: "Remove photo 1" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Photo 1 removed. 2 left." })).toBeAttached();
    await expect(photoRows(page)).toHaveCount(2);
    await expect(photoRows(page).first()).toContainText("Photo 1Main photo");
    await expect(page.getByRole("button", { name: "Remove photo 3" })).toHaveCount(0);
    // Saved photos keep their place until Save succeeds.
    expect((await storedPhotos(db, product.id)).map((p) => p.storage_path)).toEqual(before.map((p) => p.storage_path));

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
    expect((await storedPhotos(db, product.id)).map((p) => p.storage_path)).toEqual([before[2]!.storage_path, before[1]!.storage_path]);
  });

  test("AC5: dragging a photo by its picture moves it", async ({ page, db }) => {
    const product = await createProduct(db, { photos: 2, status: "hidden" });
    const before = await storedPhotos(db, product.id);
    await signIn(page, E2E_ACCOUNTS.owner, `/admin/menu/${product.id}`);
    await hydrated(page);
    const first = photoRows(page).nth(0).getByRole("img");
    const second = await photoRows(page).nth(1).boundingBox();

    const from = await first.boundingBox();
    await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
    await page.mouse.down();
    await page.mouse.move(second!.x + 40, second!.y + second!.height * 0.8, { steps: 8 }); // past its middle
    await page.mouse.up();

    await expect(page.getByRole("status").filter({ hasText: "Photo moved to position 2 of 2." })).toBeAttached();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
    expect((await storedPhotos(db, product.id)).map((p) => p.storage_path)).toEqual([before[1]!.storage_path, before[0]!.storage_path]);
  });

  test("AC6: a failed upload shows Retry while the other continues; a slow one shows progress; Save waits, and the product keeps its photos until then", async ({ page, db }) => {
    const product = await createProduct(db, { photos: 1, status: "hidden" });
    await signIn(page, E2E_ACCOUNTS.owner, `/admin/menu/${product.id}`);
    await hydrated(page);
    let puts = 0;
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/storage/v1/object/upload/sign/**", async (route) => {
      if (route.request().method() !== "PUT") return route.continue();
      puts += 1;
      if (puts === 1) return route.abort("connectionreset"); // the first upload fails midway
      await held; // the second one is slow
      return route.continue();
    });

    const jpeg = readFileSync(JPEG_WITH_EXIF);
    await addPhotos(page).setInputFiles([
      { name: "first.jpg", mimeType: "image/jpeg", buffer: jpeg },
      { name: "second.jpg", mimeType: "image/jpeg", buffer: jpeg },
    ]);

    const failed = photoRows(page).filter({ hasText: "Not uploaded. Check the connection and press Retry." });
    await expect(failed).toHaveCount(1);
    await expect(page.getByRole("progressbar")).toBeVisible(); // still uploading after 1 s
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("A photo did not upload. Retry it or remove it, then save.")).toBeVisible();
    release();
    await uploadsSettled(page);
    expect(await storedPhotos(db, product.id)).toHaveLength(1);

    await failed.getByRole("button", { name: /^Retry photo \d$/ }).click();
    await uploadsSettled(page);
    await expect(page.getByText("Not uploaded.")).toHaveCount(0);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
    expect(await storedPhotos(db, product.id)).toHaveLength(3);
  });

  test("AC6: Save pressed during an upload waits for it, then saves", async ({ page, db }) => {
    const product = await createProduct(db, { photos: 1, status: "hidden" });
    await signIn(page, E2E_ACCOUNTS.owner, `/admin/menu/${product.id}`);
    await hydrated(page);
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/storage/v1/object/upload/sign/**", async (route) => {
      if (route.request().method() === "PUT") await held;
      return route.continue();
    });

    await addPhotos(page).setInputFiles(JPEG_WITH_EXIF);
    await expect(photoList(page).getByText(/Uploading/)).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("button", { name: "Waiting for photos…" })).toBeVisible();
    release();

    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
    expect(await storedPhotos(db, product.id)).toHaveLength(2);
  });

  test("AC7: removing the only photo then choosing Available is refused with \"Add a photo first\"", async ({ page, db }) => {
    const product = await createProduct(db, { photos: 1, status: "hidden" });
    await signIn(page, E2E_ACCOUNTS.owner, `/admin/menu/${product.id}`);
    await hydrated(page);

    await page.getByRole("button", { name: "Remove photo 1" }).click();
    await page.getByRole("radio", { name: "Available" }).check();
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByRole("alert").filter({ hasText: "Add a photo first" })).toBeFocused();
    expect(await storedPhotos(db, product.id)).toHaveLength(1);
  });

  test("AC9: photos by keyboard, 44 px targets, nothing clipped, at 100% and 200%", async ({ page, db }) => {
    const product = await createProduct(db, { photos: 2, status: "hidden" });
    await signIn(page, E2E_ACCOUNTS.owner, `/admin/menu/${product.id}`);
    await hydrated(page);
    await expect(photoRows(page).first().getByRole("img", { name: product.name })).toBeVisible();
    for (const zoom of [1, 2]) {
      await withZoom(page, zoom, async () => {
        await expectNoHorizontalScroll(page);
        await expectNothingClipped(page);
        await expectTapTargets(page);
        await expectFormKeyboardOperable(page);
      });
    }
    await page.getByRole("button", { name: "Move photo 2 earlier" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status").filter({ hasText: "Photo moved to position 1 of 2." })).toBeAttached();
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`AC10: photos with a failed upload are axe clean in ${colorScheme} mode`, async ({ page, db }) => {
      await page.emulateMedia({ colorScheme });
      const product = await createProduct(db, { photos: 2, status: "hidden" });
      await signIn(page, E2E_ACCOUNTS.owner, `/admin/menu/${product.id}`);
      await hydrated(page);
      await page.route("**/storage/v1/object/upload/sign/**", (route) => (route.request().method() === "PUT" ? route.abort("connectionreset") : route.continue()));
      await addPhotos(page).setInputFiles(JPEG_WITH_EXIF);
      await expect(photoRows(page).filter({ hasText: "Not uploaded." })).toHaveCount(1, { timeout: 30_000 });

      await expectNoA11yViolations(page);
    });
  }
});

// ---------------------------------------------------------------------------
// S-048 option groups.

const groupCard = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

async function storedGroups(db: Parameters<typeof createProduct>[0], productId: string) {
  return db<{ name_en: string; kind: string; required: boolean; text_max_length: number | null; choices: { name: string; delta: number }[] }[]>`
    select g.name_en, g.kind, g.required, g.text_max_length,
      coalesce((select json_agg(json_build_object('name', c.name_en, 'delta', c.price_delta_rs) order by c.sort_order) from option_choice c where c.group_id = g.id), '[]'::json) as choices
    from option_group g where g.product_id = ${productId} order by g.sort_order`;
}

test.describe("S-048 option groups", () => {
  test("AC1: each quick-add button adds a card with a sensible kind (Size required) and moves focus to its name", async ({ page, db }) => {
    const product = await createProduct(db, { status: "hidden" });
    await signIn(page, E2E_ACCOUNTS.owner, `/admin/menu/${product.id}`);
    await hydrated(page);

    await page.getByRole("button", { name: "+ Size" }).click();
    const size = groupCard(page, "Size");
    await expect(size.getByLabel("Group name (English)")).toBeFocused();
    await expect(size.getByRole("radio", { name: "Pick one" })).toBeChecked();
    await expect(size.getByRole("checkbox", { name: "Customers must answer" })).toBeChecked();
    await expect(page.getByRole("status").filter({ hasText: "Group Size added." })).toBeAttached();

    await page.getByRole("button", { name: "+ Flavour" }).click();
    await expect(groupCard(page, "Flavour").getByRole("radio", { name: "Pick one" })).toBeChecked();
    await expect(groupCard(page, "Flavour").getByRole("checkbox", { name: "Customers must answer" })).not.toBeChecked();
    await page.getByRole("button", { name: "+ Add-ons" }).click();
    await expect(groupCard(page, "Add-ons").getByRole("radio", { name: "Pick several" })).toBeChecked();
    await page.getByRole("button", { name: "+ Message" }).click();
    const message = groupCard(page, "Message");
    await expect(message.getByRole("radio", { name: "Write a text" })).toBeChecked();
    await expect(message.getByLabel(/^Longest message/)).toHaveAttribute("placeholder", "Use default (40)");
    await expect(message.getByLabel("Group name (English)")).toBeFocused();
  });

  test("AC9 path: a cake with 2 sizes, 3 flavours, add-ons and a message is saved and comes back in order", async ({ page, db }) => {
    const product = await createProduct(db, { status: "hidden", priceRs: 1200 });
    await signIn(page, E2E_ACCOUNTS.owner, `/admin/menu/${product.id}`);
    await hydrated(page);

    await page.getByRole("button", { name: "+ Size" }).click();
    const size = groupCard(page, "Size");
    await size.getByLabel("Choice name (English)").fill("6 inch (5-10 people)");
    await expect(size.getByText("Customers pay Rs 1,200 with this choice.")).toBeVisible();
    await size.getByRole("button", { name: "Add choice to Size" }).click();
    await size.getByLabel("Choice name (English)").nth(1).fill("8 inch (15-20 people)");
    await size.getByLabel("Price change").nth(1).fill("600");
    await expect(size.getByText("Customers pay Rs 1,800 with this choice.")).toBeVisible();

    await page.getByRole("button", { name: "+ Flavour" }).click();
    const flavour = groupCard(page, "Flavour");
    for (const [i, name] of ["Chocolate", "Red velvet", "Pistachio"].entries()) {
      if (i > 0) await flavour.getByRole("button", { name: "Add choice to Flavour" }).click();
      await flavour.getByLabel("Choice name (English)").nth(i).fill(name);
    }
    await page.getByRole("button", { name: "+ Add-ons" }).click();
    await groupCard(page, "Add-ons").getByLabel("Choice name (English)").fill("Candles");
    await groupCard(page, "Add-ons").getByLabel("Price change").fill("50");
    await page.getByRole("button", { name: "+ Message" }).click();
    await groupCard(page, "Message").getByLabel(/^Longest message/).fill("25");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();

    expect(await storedGroups(db, product.id)).toEqual([
      { name_en: "Size", kind: "single", required: true, text_max_length: null, choices: [{ name: "6 inch (5-10 people)", delta: 0 }, { name: "8 inch (15-20 people)", delta: 600 }] },
      { name_en: "Flavour", kind: "single", required: false, text_max_length: null, choices: [{ name: "Chocolate", delta: 0 }, { name: "Red velvet", delta: 0 }, { name: "Pistachio", delta: 0 }] },
      { name_en: "Add-ons", kind: "multiple", required: false, text_max_length: null, choices: [{ name: "Candles", delta: 50 }] },
      { name_en: "Message", kind: "text", required: false, text_max_length: 25, choices: [] },
    ]);
    await page.reload();
    await expect(page.getByRole("list", { name: "Option groups, in order" }).getByRole("heading", { level: 3 })).toHaveText(["Size", "Flavour", "Add-ons", "Message"]);
  });

  test("AC4: a group with no choices is highlighted, the summary takes focus and links to it; nothing is saved", async ({ page, db }) => {
    const product = await createProduct(db, { status: "hidden" });
    await signIn(page, E2E_ACCOUNTS.owner, `/admin/menu/${product.id}`);
    await hydrated(page);
    await page.getByRole("button", { name: "+ Size" }).click();
    await page.getByRole("button", { name: "Remove choice 1 of Size" }).click();

    await page.getByRole("button", { name: "Save" }).click();

    const summary = page.getByRole("alert").filter({ hasText: "Please check the product" });
    await expect(summary).toBeFocused();
    await summary.getByRole("link", { name: "Size: add at least one choice." }).click();
    await expect(groupCard(page, "Size")).toBeFocused();
    await expect(groupCard(page, "Size")).toContainText("Size: add at least one choice.");
    expect(await storedGroups(db, product.id)).toEqual([]);
  });

  test("AC5: with 10 groups the add buttons are disabled with the reason; with 30 choices Add choice is", async ({ page, db }) => {
    const product = await createProduct(db, { status: "hidden" });
    await addOptionGroups(db, product.id, 10);
    const full = await createProduct(db, { status: "hidden" });
    await addOptionGroups(db, full.id, 1, 30);
    await signIn(page, E2E_ACCOUNTS.owner, `/admin/menu/${product.id}`);
    await hydrated(page);

    for (const name of ["+ Size", "+ Flavour", "+ Add-ons", "+ Message", "Add group"]) {
      await expect(page.getByRole("button", { name })).toBeDisabled();
    }
    await expect(page.getByRole("button", { name: "Add group" })).toHaveAccessibleDescription("A product has at most 10 option groups. Remove one to add another.");

    await page.goto(`/admin/menu/${full.id}`);
    await expect(page.getByRole("button", { name: "Add choice to Group 1" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Add choice to Group 1" })).toHaveAccessibleDescription("A group has at most 30 choices. Remove one to add another.");
  });

  test("AC6, AC11: groups and choices move with named buttons; each move is announced and the order is saved", async ({ page, db }) => {
    const product = await createProduct(db, { status: "hidden" });
    await addOptionGroups(db, product.id, 2, 2);
    await signIn(page, E2E_ACCOUNTS.owner, `/admin/menu/${product.id}`);
    await hydrated(page);
    await expect(page.getByRole("button", { name: "Move group Group 1 earlier" })).toBeDisabled();

    await page.getByRole("button", { name: "Move group Group 2 earlier" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Group moved to position 1 of 2." })).toBeAttached();
    await page.getByRole("button", { name: "Move choice 2 of Group 2 earlier" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Choice moved to position 1 of 2 in Group 2." })).toBeAttached();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();

    const groups = await storedGroups(db, product.id);
    expect(groups.map((g) => g.name_en)).toEqual(["Group 2", "Group 1"]);
    expect(groups[0]!.choices.map((c) => c.name)).toEqual(["Choice 2", "Choice 1"]);
  });

  test("AC6: a group moves by dragging its grip", async ({ page, db }) => {
    const product = await createProduct(db, { status: "hidden" });
    await addOptionGroups(db, product.id, 2);
    await signIn(page, E2E_ACCOUNTS.owner, `/admin/menu/${product.id}`);
    await hydrated(page);
    const headings = page.getByRole("list", { name: "Option groups, in order" }).getByRole("heading", { level: 3 });
    const grip = page.getByRole("list", { name: "Option groups, in order" }).locator(":scope > li").nth(0).locator("[aria-hidden=true]").first();
    await grip.scrollIntoViewIfNeeded();
    const box = await grip.boundingBox();
    const height = page.viewportSize()!.height;

    // Press the grip, then rest near the bottom edge: the page scrolls and the card follows.
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2, height - 10, { steps: 8 });
    await expect(headings).toHaveText(["Group 2", "Group 1"], { timeout: 15_000 });
    await page.mouse.up();
    await expect(page.getByRole("status").filter({ hasText: "Group moved to position 2 of 2." })).toBeAttached();
  });

  test("AC7: a choice that can push the price below Rs 0 shows the warning; saving is allowed", async ({ page, db }) => {
    const product = await createProduct(db, { status: "hidden", priceRs: 500 });
    await signIn(page, E2E_ACCOUNTS.owner, `/admin/menu/${product.id}`);
    await hydrated(page);
    await page.getByRole("button", { name: "+ Size" }).click();
    const size = groupCard(page, "Size");
    await size.getByLabel("Choice name (English)").fill("Mini");
    await size.getByRole("combobox", { name: "Adds or takes off, choice 1 of Size" }).selectOption("-");
    await size.getByLabel("Price change").fill("600");

    await expect(page.getByText("This option can make the price below Rs 0.", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
    expect((await storedGroups(db, product.id))[0]!.choices).toEqual([{ name: "Mini", delta: -600 }]);
  });

  test("AC10: group cards by keyboard, 44 px targets, nothing clipped, no sideways scroll, at 100% and 200%", async ({ page, db }) => {
    const product = await createProduct(db, { status: "hidden" });
    await addOptionGroups(db, product.id, 2, 2);
    await signIn(page, E2E_ACCOUNTS.owner, `/admin/menu/${product.id}`);
    await hydrated(page);
    await page.getByRole("button", { name: "+ Message" }).click();
    for (const zoom of [1, 2]) {
      await withZoom(page, zoom, async () => {
        await expectNoHorizontalScroll(page);
        await expectNothingClipped(page);
        await expectTapTargets(page);
        await expectFormKeyboardOperable(page, 200);
        await expectBarsHideNothing(page);
      });
    }
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`AC11: labelled fields, distinct control names and an error, axe clean in ${colorScheme} mode`, async ({ page, db }) => {
      await page.emulateMedia({ colorScheme });
      const product = await createProduct(db, { status: "hidden" });
      await addOptionGroups(db, product.id, 2, 2);
      await signIn(page, E2E_ACCOUNTS.owner, `/admin/menu/${product.id}`);
      await hydrated(page);
      const names = await page.getByRole("button", { name: /^(Move|Remove) (choice|group)/ }).evaluateAll((buttons) => buttons.map((b) => b.getAttribute("aria-label")));
      expect(new Set(names).size).toBe(names.length);
      await expectNoA11yViolations(page);

      await page.getByRole("button", { name: "+ Size" }).click();
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByRole("alert").filter({ hasText: "Please check the product" })).toBeFocused();
      await expect(groupCard(page, "Size").getByLabel("Choice name (English)")).toHaveAccessibleDescription("Size, choice 1: enter the choice name in English.");
      await expectNoA11yViolations(page);
    });
  }
});

// ---------------------------------------------------------------------------
// S-049 seasonal dates.

test.describe("S-049 seasonal dates", () => {
  test("AC1, AC2: dates save and the menu row says Scheduled seasonal; a start after the end is refused with a linked message", async ({ page, db }) => {
    const product = await createProduct(db, { status: "hidden" });
    await signIn(page, E2E_ACCOUNTS.owner, `/admin/menu/${product.id}`);
    await hydrated(page);
    const first = page.getByLabel("First day");
    const last = page.getByLabel("Last day");
    await expect(first).toHaveAccessibleDescription(/Day, month and year, for example 01\/12\/2026\./);

    await first.fill("2099-12-24");
    await last.fill("2099-12-01");
    await page.getByRole("button", { name: "Save" }).click();
    const summary = page.getByRole("alert").filter({ hasText: "Please check the product" });
    await expect(summary).toBeFocused();
    await summary.getByRole("link", { name: "The last day must be on or after the first day." }).click();
    await expect(first).toBeFocused();
    await expect(first).toHaveAccessibleDescription(/The last day must be on or after the first day\./);

    await first.fill("2099-12-01");
    await last.fill("2099-12-24");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
    await page.getByRole("link", { name: "Back to the menu" }).click();
    await expect(rowOf(page, product.name)).toContainText("Scheduled seasonal");
  });

  test("AC6: the date fields by keyboard, 44 px targets, nothing clipped, at 100% and 200%", async ({ page, db }) => {
    const product = await createProduct(db, { status: "hidden" });
    await signIn(page, E2E_ACCOUNTS.owner, `/admin/menu/${product.id}`);
    await hydrated(page);
    for (const zoom of [1, 2]) {
      await withZoom(page, zoom, async () => {
        await expectNoHorizontalScroll(page);
        await expectNothingClipped(page);
        await expectTapTargets(page);
        await expectFormKeyboardOperable(page, 120);
        await expectBarsHideNothing(page);
      });
    }
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`AC6: labelled date fields with a format hint and a linked error, axe clean in ${colorScheme} mode`, async ({ page, db }) => {
      await page.emulateMedia({ colorScheme });
      const product = await createProduct(db, { status: "hidden" });
      await signIn(page, E2E_ACCOUNTS.owner, `/admin/menu/${product.id}`);
      await hydrated(page);
      await page.getByLabel("First day").fill("2099-12-01");
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByLabel("Last day")).toHaveAccessibleDescription(/Enter both seasonal dates, or clear both\./);
      await expectNoA11yViolations(page);
    });
  }
});

// ---------------------------------------------------------------------------
// S-042 reorder products within a type. Tests that change an order use the Seasonal group
// (no other spec adds seasonal products) and run one at a time on the 375 px phone, so a
// parallel spec never adds a product to that group between a page load and a move.

/** The Seasonal group's names once it has rendered (reading earlier raced the list and got none). */
async function seasonalNames(page: Page): Promise<string[]> {
  const links = page.getByRole("list", { name: "Seasonal" }).getByRole("link");
  await expect(links.first()).toBeVisible();
  return links.allTextContents();
}

async function seasonalOrder(db: Parameters<typeof createProduct>[0]): Promise<string[]> {
  const rows = await db<{ id: string }[]>`select id from product where type = 'seasonal' order by sort_order, name_en`;
  return rows.map((r) => r.id);
}

test.describe("S-042 reorder within a type", () => {
  test.describe.configure({ mode: "serial" });

  /** Order-changing tests run once, on the 375 px phone (see above). */
  const onlyOnPhone = () => test.skip(test.info().project.name !== "phone-375", "changes the Seasonal order: runs once, on the phone");

  test("AC1, AC3: arrow keys on the handle move the product, announce its position, autosave with Saved, and survive a reload", async ({ page, db }) => {
    onlyOnPhone();
    const first = await createProduct(db, { name: "Aaa first", type: "seasonal" });
    const second = await createProduct(db, { name: "Aab second", type: "seasonal" });
    await signIn(page, E2E_ACCOUNTS.owner, "/admin/menu");
    await hydrated(page);
    const before = await seasonalNames(page);
    const from = before.indexOf(second.name);

    const handle = page.getByRole("button", { name: `Reorder ${second.name}` });
    await expect(handle).toHaveAccessibleDescription("Use the up and down arrow keys to move it. The new order is saved at once.");
    await handle.focus();
    await page.keyboard.press("ArrowUp");

    await expect(page.getByRole("status").filter({ hasText: `${second.name} moved to position ${from} of ${before.length}.` })).toBeAttached();
    await expect(handle).toBeFocused();
    await expect(page.getByRole("region", { name: "Seasonal" }).getByRole("status")).toHaveText("Saved");
    await page.reload();
    const after = await seasonalNames(page);
    expect(after.indexOf(second.name)).toBe(after.indexOf(first.name) - 1);
    const ids = await seasonalOrder(db);
    expect(ids.indexOf(second.id)).toBeLessThan(ids.indexOf(first.id));
  });

  test("AC1: dragging the handle moves the product and saves", async ({ page, db }) => {
    onlyOnPhone();
    const top = await createProduct(db, { name: "Aac drag top", type: "seasonal" });
    const below = await createProduct(db, { name: "Aad drag below", type: "seasonal" });
    await signIn(page, E2E_ACCOUNTS.owner, "/admin/menu");
    await hydrated(page);
    await rowOf(page, below.name).scrollIntoViewIfNeeded();
    const handle = await page.getByRole("button", { name: `Reorder ${top.name}` }).boundingBox();
    const target = await rowOf(page, below.name).boundingBox();

    await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle!.x + handle!.width / 2, target!.y + target!.height * 0.8, { steps: 8 });
    await page.mouse.up();

    await expect(page.getByRole("region", { name: "Seasonal" }).getByRole("status")).toHaveText("Saved");
    const ids = await seasonalOrder(db);
    expect(ids.indexOf(below.id)).toBeLessThan(ids.indexOf(top.id));
  });

  test.describe("on a touch phone (Pixel 7)", () => {
    // Real touch input (CDP touch events become pointer events with pointerType "touch").
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { defaultBrowserType, ...pixel7 } = devices["Pixel 7"];
    test.use(pixel7);

    type Step = () => Promise<void>;
    /** Press at `from` (then `pressed`), move to `to` in steps, run `held` while still pressing, then lift. */
    async function touchDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, { pressed, held }: { pressed?: Step; held?: Step } = {}) {
      const cdp = await page.context().newCDPSession(page);
      const touch = (type: "touchStart" | "touchMove" | "touchEnd", point?: { x: number; y: number }) =>
        cdp.send("Input.dispatchTouchEvent", { type, touchPoints: point ? [{ x: point.x, y: point.y }] : [] });
      await touch("touchStart", from);
      await pressed?.();
      const steps = 12;
      for (let i = 1; i <= steps; i += 1) await touch("touchMove", { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps });
      await held?.();
      await touch("touchEnd");
      await cdp.detach();
    }

    const centre = (box: { x: number; y: number; width: number; height: number }) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

    test("AC1, AC10: a finger drag lifts a ghost, shows the dashed drop slot and the new place, then saves", async ({ page, db }) => {
      onlyOnPhone();
      const top = await createProduct(db, { name: "Aah touch top", type: "seasonal" });
      const below = await createProduct(db, { name: "Aai touch below", type: "seasonal" });
      await signIn(page, E2E_ACCOUNTS.owner, "/admin/menu");
      await hydrated(page);
      const names = await seasonalNames(page);
      await rowOf(page, below.name).scrollIntoViewIfNeeded();
      const handle = (await page.getByRole("button", { name: `Reorder ${top.name}` }).boundingBox())!;
      const target = (await rowOf(page, below.name).boundingBox())!;

      const pressed = async () => {
        await expect(page.getByRole("status").filter({ hasText: `Picked up ${top.name}, position ${names.indexOf(top.name) + 1} of ${names.length}.` })).toBeAttached();
      };
      const held = async () => {
        // Mid-drag: a ghost of the row follows the finger; the dashed slot sits where it will land.
        await expect(page.locator("[data-drag-ghost]")).toHaveCount(1);
        await expect(page.locator("[data-drag-ghost]")).toContainText(top.name);
        const slot = page.locator("[data-drag-placeholder]");
        await expect(slot).toHaveCount(1);
        await expect(slot).toHaveCSS("outline-style", "dashed");
        await expect(page.getByRole("status").filter({ hasText: /^Moved to position \d+ of \d+\.$/ })).toBeAttached();
        // The slot has slid over the row below (rows move with transform, not in the DOM).
        await expect.poll(async () => (await slot.boundingBox())!.y).toBeGreaterThan(target.y - 2);
      };
      await touchDrag(page, centre(handle), { x: centre(handle).x, y: target.y + target.height * 0.8 }, { pressed, held });

      await expect(page.locator("[data-drag-ghost]")).toHaveCount(0);
      await expect(page.locator("[data-drag-placeholder]")).toHaveCount(0);
      await expect(page.getByRole("status").filter({ hasText: `Dropped. ${top.name} is at position` })).toBeAttached();
      await expect(page.getByRole("region", { name: "Seasonal" }).getByRole("status")).toHaveText("Saved");
      const after = await seasonalNames(page);
      expect(after.indexOf(below.name)).toBe(after.indexOf(top.name) - 1);
      const ids = await seasonalOrder(db);
      expect(ids.indexOf(below.id)).toBeLessThan(ids.indexOf(top.id));
    });

    test("AC10: Esc or a release outside the list puts the row back and saves nothing", async ({ page, db }) => {
      onlyOnPhone();
      const moving = await createProduct(db, { name: "Aaj touch cancel", type: "seasonal" });
      await createProduct(db, { name: "Aak touch cancel below", type: "seasonal" });
      await signIn(page, E2E_ACCOUNTS.owner, "/admin/menu");
      await hydrated(page);
      const before = await seasonalOrder(db);
      const names = await seasonalNames(page);
      const handle = page.getByRole("button", { name: `Reorder ${moving.name}` });
      await handle.scrollIntoViewIfNeeded();
      const box = (await handle.boundingBox())!;
      const list = (await page.getByRole("list", { name: "Seasonal" }).boundingBox())!;

      // Released far above the list (outside it, short of the auto-scroll band).
      await touchDrag(page, centre(box), { x: centre(box).x, y: Math.max(list.y - 2 * box.height - 60, 80) });
      await expect(page.getByRole("status").filter({ hasText: `Put back. ${moving.name} stays at position ${names.indexOf(moving.name) + 1}` })).toBeAttached();

      // Esc while dragging.
      const escape = async () => {
        await page.keyboard.press("Escape");
        await expect(page.locator("[data-drag-ghost]")).toHaveCount(0);
      };
      await touchDrag(page, centre(box), { x: centre(box).x, y: box.y + box.height * 1.5 }, { held: escape });

      await expect(page.locator("[data-drag-placeholder]")).toHaveCount(0);
      expect(await seasonalNames(page)).toEqual(names);
      expect(await seasonalOrder(db)).toEqual(before);
    });
  });

  test("AC11: the one-time hint shows the grip, hides on dismiss and stays hidden after a reload", async ({ page, db }) => {
    await createProduct(db, { name: "Hint pair one" });
    await createProduct(db, { name: "Hint pair two" });
    await signIn(page, E2E_ACCOUNTS.owner, "/admin/menu");
    await hydrated(page);
    const hint = page.getByRole("region", { name: "Tip: reordering" });

    await expect(hint).toHaveText("Hold the grip and drag to reorder.");
    await hint.getByRole("button", { name: "Hide this tip" }).click();
    await expect(hint).toHaveCount(0);
    await page.reload();
    await hydrated(page);
    await expect(page.getByRole("heading", { level: 2, name: "Cakes" })).toBeVisible();
    await expect(hint).toHaveCount(0);
  });

  test("AC3, AC7: the sheet's Move up and Move down; at the ends they are disabled and say why", async ({ page, db }) => {
    onlyOnPhone();
    await createProduct(db, { name: "Aae sheet", type: "seasonal" });
    await signIn(page, E2E_ACCOUNTS.owner, "/admin/menu");
    await hydrated(page);
    const names = await seasonalNames(page);
    const firstName = names[0]!;
    const lastName = names.at(-1)!;

    const sheet = await openActions(page, firstName);
    await expect(sheet.getByRole("button", { name: `Move ${firstName} up` })).toBeDisabled();
    await expect(sheet.getByRole("button", { name: `Move ${firstName} up` })).toHaveAccessibleDescription("Already first in its group.");
    await sheet.getByRole("button", { name: `Move ${firstName} down` }).click();
    await expect(sheet.getByText(`Position 2 of ${names.length} in its group`)).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: `${firstName} moved to position 2 of ${names.length}.` })).toBeAttached();
    await page.keyboard.press("Escape");

    const lastSheet = await openActions(page, lastName);
    await expect(lastSheet.getByRole("button", { name: `Move ${lastName} down` })).toBeDisabled();
    await expect(lastSheet.getByRole("button", { name: `Move ${lastName} down` })).toHaveAccessibleDescription("Already last in its group.");
  });

  test("AC4: when a product was added meanwhile, the move is refused with \"The menu changed, reload\" and Reload shows it", async ({ page, db }) => {
    onlyOnPhone();
    const mine = await createProduct(db, { name: "Aaf stale", type: "seasonal" });
    await signIn(page, E2E_ACCOUNTS.owner, "/admin/menu");
    await hydrated(page);
    const before = await seasonalOrder(db);
    const added = await createProduct(db, { name: "Aag added meanwhile", type: "seasonal" });

    await page.getByRole("button", { name: `Reorder ${mine.name}` }).focus();
    await page.keyboard.press(before.indexOf(mine.id) === 0 ? "ArrowDown" : "ArrowUp");

    const alert = page.getByRole("alert").filter({ hasText: "The menu changed, reload." });
    await expect(alert).toBeVisible();
    expect((await seasonalOrder(db)).filter((id) => id !== added.id)).toEqual(before);
    await alert.getByRole("button", { name: "Reload" }).click();
    await expect(page.getByRole("link", { name: added.name })).toBeVisible();
    await expect(alert).toBeHidden(); // review: the refusal goes once the fresh list is shown
  });

  test("AC8, AC9: handles and buttons are 44 px with distinct names; nothing clipped or sideways at 100% and 200%", async ({ page, db }) => {
    await createProduct(db, { name: "Reorder targets", status: "sold_out" });
    await signIn(page, E2E_ACCOUNTS.owner, "/admin/menu");
    await hydrated(page);
    for (const zoom of [1, 2]) {
      await withZoom(page, zoom, async () => {
        await expectNoHorizontalScroll(page);
        await expectNothingClipped(page);
        await expectTapTargets(page);
      });
    }
    // Each handle names its own product (products may share a name; their rows then do too).
    const mismatched = await page.locator("li:has([data-reorder-handle])").evaluateAll((rows) =>
      rows.filter((row) => row.querySelector("[data-reorder-handle]")?.getAttribute("aria-label") !== `Reorder ${row.querySelector("a")?.textContent ?? ""}`).length,
    );
    expect(mismatched).toBe(0);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`AC8, AC9: reduced motion and no serious or critical axe violations with the Move buttons open, ${colorScheme} mode`, async ({ page, db }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      const product = await createProduct(db, { name: "Reorder axe" });
      await signIn(page, E2E_ACCOUNTS.owner, "/admin/menu");
      await hydrated(page);
      const row = rowOf(page, product.name);
      expect(await row.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("0s");
      await expectNoA11yViolations(page);
      await openActions(page, product.name);
      await expectNoA11yViolations(page);
    });
  }
});

test.describe("S-051 preview as a customer", () => {
  test("AC1, AC5: Preview opens the customer page of a hidden product with the banner first, no Add button, noindex and no-store", async ({ page, db }) => {
    const product = await createProduct(db, { name: "Preview cake", status: "hidden" });
    await signIn(page, E2E_ACCOUNTS.owner, `/admin/menu/${product.id}`);
    await hydrated(page);

    await page.getByRole("link", { name: "Preview" }).click();

    await expect(page.getByRole("heading", { level: 1, name: product.name })).toBeVisible();
    await expect(page.getByText("Preview, not live.")).toBeVisible();
    await expect(page.getByText("Hidden: customers cannot see this product.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add to basket" })).toHaveCount(0);
    const response = await page.request.get(`/admin/menu/${product.id}/preview`);
    expect(response.headers()["x-robots-tag"]).toContain("noindex");
    expect(response.headers()["cache-control"]).toContain("no-store");
    // The banner is read before the page and is not inside a landmark.
    const order = await page.evaluate(() => {
      const banner = [...document.querySelectorAll("p")].find((p) => p.textContent?.includes("Preview, not live."))!;
      const following = banner.compareDocumentPosition(document.querySelector("h1")!) & Node.DOCUMENT_POSITION_FOLLOWING;
      return { before: following !== 0, landmark: banner.closest("header, nav, aside, main, [role]") !== null };
    });
    expect(order).toEqual({ before: true, landmark: false });
  });

  test("AC3: the language toggle shows the product in French with English fallback", async ({ page, db }) => {
    const product = await createProduct(db, { name: "Toggle cake", status: "sold_out" });
    await signIn(page, E2E_ACCOUNTS.owner, `/admin/menu/${product.id}/preview`);
    await hydrated(page);

    await page.getByRole("link", { name: "Voir en français" }).click();

    await expect(page).toHaveURL(/\?lang=fr$/);
    await expect(page.getByRole("heading", { level: 1, name: product.name })).toBeVisible();
    await expect(page.getByRole("link", { name: "Show in English" })).toBeVisible();
  });

  test("AC4: on a new product Preview says to save first and opens nothing", async ({ page }) => {
    await signIn(page, E2E_ACCOUNTS.owner, "/admin/menu/new");
    await hydrated(page);

    await page.getByRole("button", { name: "Preview" }).click();

    await expect(page.getByRole("status").filter({ hasText: "Cannot preview, save first." })).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/menu\/new$/);
  });

  test("AC5: an anonymous visitor is sent to sign in and sees no product data", async ({ page, db }) => {
    const product = await createProduct(db, { name: "Secret preview", status: "hidden" });

    await page.goto(`/admin/menu/${product.id}/preview`);

    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.getByText(product.name)).toHaveCount(0);
  });

  test("AC7: keyboard, focus, 44 px targets, nothing clipped or sideways, at 100% and 200%", async ({ page, db }) => {
    const product = await createProduct(db, { name: "A preview cake with a rather long name to wrap", status: "hidden" });
    await signIn(page, E2E_ACCOUNTS.owner, `/admin/menu/${product.id}/preview`);
    await hydrated(page);
    await expect(page.getByRole("heading", { level: 1, name: product.name })).toBeVisible();
    for (const zoom of [1, 2]) {
      await withZoom(page, zoom, async () => {
        await expectNoHorizontalScroll(page);
        await expectNothingClipped(page);
        await expectTapTargets(page);
        await expectKeyboardOperable(page);
      });
    }
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`AC7: no serious or critical axe violations in ${colorScheme} mode`, async ({ page, db }) => {
      const product = await createProduct(db, { name: "Axe preview", status: "sold_out" });
      await page.emulateMedia({ colorScheme });
      await signIn(page, E2E_ACCOUNTS.owner, `/admin/menu/${product.id}/preview`);
      await hydrated(page);
      await expectNoA11yViolations(page);
    });
  }
});
