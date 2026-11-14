// E-13 S-246 (admin Pages: text in English and French) and S-247 (page photos), end to end.
// Saves run under the site-page lock and put the page back; checks of the screens themselves
// run in every project (320, 375 and 1280 px).
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
import { E2E_ACCOUNTS } from "./support/database";
import { type Page, expect, test } from "./support/fixtures";
import { withSitePage } from "./support/site-page-lock";

const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));
const JPEG = `${FIXTURES}cake-exif.jpg`;
/** Sarah is an Admin, not an Owner: Pages is open to both (S-246 AC6). */
const ADMIN = E2E_ACCOUNTS.helper;

const hydrated = (page: Page) => expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
const saved = (page: Page) => expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
const save = (page: Page) => page.getByRole("button", { name: "Save page" }).click();

async function openEditor(page: Page, key: string, name: string) {
  await signIn(page, ADMIN, `/admin/pages/${key}`);
  await hydrated(page);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

test.describe("S-246 Pages list and text editor", () => {
  test("AC1: More > Pages lists the five pages with Sample text badges; each whole row opens its editor", async ({ page }) => {
    await signIn(page, ADMIN, "/admin/more");
    await page.getByRole("link", { name: "Pages" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Pages" })).toBeVisible();
    const rows = page.getByRole("list", { name: "Brand pages" }).getByRole("link");
    await expect(rows).toHaveCount(5);
    await expect(rows.first()).toContainText("Our story");
    await expect(rows.filter({ hasText: "Sample text" }).first()).toBeVisible();
    for (const box of await Promise.all((await rows.all()).map((row) => row.boundingBox()))) expect(box!.height).toBeGreaterThanOrEqual(64);

    await rows.filter({ hasText: "Custom order" }).click();
    await expect(page).toHaveURL(/\/admin\/pages\/custom_order$/);
    await expect(page.getByRole("heading", { level: 1, name: "Custom order" })).toBeVisible();
  });

  test("AC2, AC3, AC7: edit English, leave French empty (hint), Save: Saved announced, badge gone, the site shows it at once", async ({ page, db }, testInfo) => {
    test.skip(testInfo.project.name !== "phone-375", "saves a shared page: one project is enough");
    await withSitePage(db, "gallery", async () => {
      await openEditor(page, "gallery", "Gallery");
      await expect(page.getByText("Still sample text")).toBeVisible();
      const french = page.getByRole("textbox", { name: "Introduction (French)" });
      await french.fill("");
      await expect(french).toHaveAccessibleDescription(/French is empty: English will show in French\./);
      await page.getByRole("textbox", { name: "Introduction (English)" }).fill("Our cakes, as they left the kitchen.\n<b>No HTML here</b>");

      await save(page);
      await saved(page);
      await expect(page.getByText("Still sample text")).toHaveCount(0);

      await page.goto("/admin/pages");
      await expect(page.getByRole("link", { name: /Gallery/ })).not.toContainText("Sample text");
      await expect(page.getByRole("link", { name: /Gallery/ })).toContainText("by Sarah");

      await page.goto("/fr/gallery");
      await expect(page.getByText("Our cakes, as they left the kitchen.")).toBeVisible();
      await expect(page.getByText("<b>No HTML here</b>")).toBeVisible();
      await expect(page.locator('meta[name="robots"][content="noindex"]')).toHaveCount(0);
    });
  });

  test("AC4: an intro over 300 characters cannot be typed; the count says how many are left", async ({ page }) => {
    await openEditor(page, "our_story", "Our story");
    const intro = page.getByRole("textbox", { name: "Introduction (English)" });
    await intro.fill("x".repeat(320));
    await expect(intro).toHaveValue("x".repeat(300));
    await expect(intro).toHaveAccessibleDescription(/0 characters left/);
  });

  test("AC5: another admin saved first: PAGE_CHANGED, typed text kept until Reload is chosen", async ({ page, browser, db }, testInfo) => {
    test.skip(testInfo.project.name !== "phone-375", "saves a shared page: one project is enough");
    await withSitePage(db, "custom_order", async () => {
      const other = await browser.newPage();
      await openEditor(page, "custom_order", "Custom order");
      await openEditor(other, "custom_order", "Custom order");
      await page.getByRole("textbox", { name: "Introduction (English)" }).fill("First edit");
      await save(page);
      await saved(page);

      await other.getByRole("textbox", { name: "Introduction (English)" }).fill("My long careful text");
      await save(other);
      const changed = other.getByRole("alert").filter({ hasText: "Someone changed this page. Reload." });
      await expect(changed).toBeFocused();
      await expect(other.getByRole("textbox", { name: "Introduction (English)" })).toHaveValue("My long careful text");
      await changed.getByRole("link", { name: "Reload the page" }).click();
      await expect(other.getByRole("textbox", { name: "Introduction (English)" })).toHaveValue("First edit");
      await other.close();
    });
  });

  test("AC7: leaving with unsaved changes asks first", async ({ page }) => {
    await openEditor(page, "workshops", "Workshops");
    await page.getByRole("textbox", { name: "Main text (English)" }).fill("Not saved");
    await page.getByRole("link", { name: "All pages" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Keep editing" }).click();
    await expect(page).toHaveURL(/\/admin\/pages\/workshops$/);
  });

  test("AC9: the contact editor says WhatsApp, phone, address and map are in Settings (plain text for an Admin)", async ({ page }) => {
    await openEditor(page, "contact", "Contact us");
    await expect(page.getByText("WhatsApp, phone, pickup address and map link are changed in Settings, by an Owner.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Settings" })).toHaveCount(0);
  });

  test("AC8: 320/375/1280 and 200% zoom: no sideways scroll, nothing clipped, 44 px targets, keyboard order, axe clean", async ({ page }) => {
    await openEditor(page, "workshops", "Workshops");
    // Tidy job: the retired S-249 "Next workshop" fields are gone (E-15 events replaced them).
    await expect(page.getByRole("heading", { name: "Next workshop" })).toHaveCount(0);
    await expect(page.getByLabel("Workshop title (English)")).toHaveCount(0);
    const english = await page.getByRole("textbox", { name: "Main text (English)" }).boundingBox();
    const french = await page.getByRole("textbox", { name: "Main text (French)" }).boundingBox();
    const wide = (page.viewportSize()?.width ?? 0) >= 768;
    expect(wide ? Math.abs(english!.y - french!.y) < 2 : french!.y > english!.y + english!.height).toBe(true);
    for (const zoom of [1, 2]) {
      await withZoom(page, zoom, async () => {
        await expectNoHorizontalScroll(page);
        await expectNothingClipped(page);
        await expectTapTargets(page);
      });
    }
    await expect(page.getByRole("button", { name: "Save page" })).toBeInViewport();
    const pin = await page.addStyleTag({ content: "[data-bottom-bar] { display: block !important; }" });
    await expectKeyboardOperable(page, 200);
    await pin.evaluate((style) => (style as Element).remove());
    await expectNoA11yViolations(page);
  });
});

test.describe("S-247 page photos", () => {
  const photoList = (page: Page) => page.getByRole("list", { name: "Page photos, in order" });

  test("AC1, AC3, AC4, AC9: add a photo (compressed, uploaded), alt required, reorder, remove with confirm; the site follows", async ({ page, db }, testInfo) => {
    test.skip(testInfo.project.name !== "phone-375", "saves a shared page: one project is enough");
    test.slow();
    await withSitePage(db, "workshops", async (sql) => {
      await openEditor(page, "workshops", "Workshops");
      const chunks: string[] = [];
      page.on("request", (request) => chunks.push(request.url()));
      await page.getByRole("group", { name: "Page photos, in order" }).getByLabel("Add photos").setInputFiles([JPEG, JPEG]);
      await expect(photoList(page).getByText(/Getting the photo ready|Uploading/)).toHaveCount(0, { timeout: 30_000 });
      expect(chunks.some((url) => /image-compress/.test(url))).toBe(true);
      await expect(photoList(page).getByRole("listitem")).toHaveCount(2);

      await save(page);
      const summary = page.getByRole("alert").filter({ hasText: "Check these fields" });
      await expect(summary).toBeFocused();
      await expect(summary.getByRole("link", { name: "Photo 1: describe what the photo shows (English)." })).toBeVisible();

      await page.getByRole("textbox", { name: "Photo 1: what it shows (English)" }).fill("Two cakes on the counter");
      await page.getByRole("textbox", { name: "Photo 2: what it shows (English)" }).fill("Icing a cake");
      await page.getByRole("button", { name: "Move photo 2 earlier" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Photo moved to position 1 of 2." })).toBeAttached();
      await save(page);
      await saved(page);
      const stored = await sql<{ alt_en: string; storage_path: string }[]>`select alt_en, storage_path from site_page_photo where page_key = 'workshops' order by sort_order`;
      expect(stored.map((p) => p.alt_en)).toEqual(["Icing a cake", "Two cakes on the counter"]);
      expect(stored[0]!.storage_path).toMatch(/^site\/pages\/workshops\//);

      await page.getByRole("button", { name: "Remove photo 2" }).click();
      await page.getByRole("button", { name: "Remove photo", exact: true }).click();
      await expect(page.getByRole("status").filter({ hasText: "Photo 2 removed. 1 left." })).toBeAttached();
      await save(page);
      await expect.poll(async () => (await sql`select 1 from site_page_photo where page_key = 'workshops'`).length).toBe(1);

      await page.goto("/workshops");
      await expect(page.getByRole("img", { name: "Icing a cake" })).toBeVisible();
      await expect(page.getByRole("img", { name: "Two cakes on the counter" })).toHaveCount(0);
    });
  });

  test("AC2: a non-image is refused before upload; the add button names itself and the limit", async ({ page }) => {
    await openEditor(page, "our_story", "Our story");
    const sent: string[] = [];
    page.on("request", (request) => {
      if (request.method() !== "GET") sent.push(request.url());
    });
    await page.getByLabel("Add photos").setInputFiles([{ name: "menu.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\n") }]);
    await expect(page.getByText("menu.pdf is not a photo we can use. Choose a JPEG, PNG, WebP or HEIC photo.")).toBeVisible();
    await expect(page.getByLabel("Add photos")).toHaveAccessibleDescription(/Up to 4\./);
    expect(sent).toEqual([]);
  });
});
