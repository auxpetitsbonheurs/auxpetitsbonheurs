// S-052 / S-053 admin promotions, end to end: an Admin creates a promotion from More, with a
// banner linked to a product and 20% off it, and the customer site shows both at an instant
// inside its window. Each test uses its own product and a one-day window in 2041-2050 (the
// promo-banner spec uses 2031-2040), with the server clock fixed inside it for the customer
// pages, so specs running in parallel never see this promotion.
import { randomInt } from "node:crypto";
import { fileURLToPath } from "node:url";
import { expectNoA11yViolations, expectNoHorizontalScroll, expectTapTargets } from "./support/a11y";
import { createE2eAdmin, signIn } from "./support/admin";
import { createProduct } from "./support/catalogue";
import { setClock } from "./support/clock";
import { type Page, expect, test } from "./support/fixtures";

/** A Mauritius day in 2041-2050, as the editor's datetime-local values and an instant inside it. */
function ownDay() {
  const day = new Date(Date.UTC(2041, 0, 1) + randomInt(0, 3600) * 86_400_000).toISOString().slice(0, 10);
  return { starts: `${day}T09:00`, ends: `${day}T18:00`, inside: `${day}T08:00:00Z` };
}

async function hydrated(page: Page) {
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
}

test.describe("S-052, S-053 admin promotions", () => {
  test("an Admin creates a banner promotion with 20% off a cake; the list shows it and the site shows banner and price", async ({ page, db, baseURL }) => {
    const admin = await createE2eAdmin(db, { role: "admin" });
    const product = await createProduct(db, { name: "Promo cake", priceRs: 1200 });
    const day = ownDay();
    const title = `Birthday week ${randomInt(1e6)}`;

    await signIn(page, admin, "/admin/more");
    await hydrated(page);
    await page.getByRole("link", { name: "Promotions" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Promotions" })).toBeVisible();
    await page.getByRole("link", { name: "New promotion" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "New promotion" })).toBeVisible();

    await page.getByLabel("Title (English)").fill(title);
    await page.getByLabel(/^Text \(English\)/).fill("20% off this cake today only.");
    await page.getByLabel("Starts").fill(day.starts);
    await page.getByLabel("Ends").fill(day.ends);
    await page.getByLabel("Where the banner and card lead").selectOption({ label: "A product" });
    await page.getByLabel("Product", { exact: true }).selectOption({ label: product.name });
    await page.getByLabel(`Offer for ${product.name}`).selectOption({ label: "Percent off" });
    await page.getByLabel(`Amount for ${product.name}`).fill("20");
    await expect(page.getByText("Customers pay Rs 960 instead of Rs 1,200")).toBeVisible();
    await expectNoA11yViolations(page);
    await expectNoHorizontalScroll(page);

    await page.getByRole("button", { name: "Save promotion" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Promotion saved" })).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/promotions$/);
    const row = page.getByRole("listitem").filter({ hasText: title });
    await expect(row.getByText("Scheduled")).toBeVisible();
    await expect(row.getByText("Banner and Home card · Offer price on 1 product")).toBeVisible();
    await expectTapTargets(page);

    await setClock(page.context(), baseURL!, day.inside);
    await page.goto(`/menu/${product.slug}`);
    const banner = page.getByRole("complementary", { name: "Current offer" });
    await expect(banner.getByRole("link", { name: new RegExp(title) })).toHaveAttribute("href", `/menu/${product.slug}`);
    await expect(page.getByRole("main").getByText("Was Rs 1,200, now Rs 960").first()).toBeAttached();
  });

  test("an end before the start is refused and linked from the summary; nothing is saved", async ({ page, db }) => {
    const admin = await createE2eAdmin(db, { role: "admin" });
    const title = `Refused ${randomInt(1e6)}`;
    await signIn(page, admin, "/admin/promotions/new");
    await hydrated(page);
    await page.getByLabel("Title (English)").fill(title);
    await page.getByLabel("Starts").fill("2042-02-02T18:00");
    await page.getByLabel("Ends").fill("2042-02-02T09:00");
    await page.getByRole("button", { name: "Save promotion" }).click();
    const summary = page.getByRole("alert").filter({ hasText: "Check these fields" });
    await expect(summary).toBeFocused();
    await summary.getByRole("link", { name: "Ends: the end must be after the start." }).click();
    await expect(page.getByLabel("Ends")).toBeFocused();
    expect((await db`select 1 from promotion where title_en = ${title}`).length).toBe(0);
  });

  test("switch off and delete from the list", async ({ page, db }) => {
    const admin = await createE2eAdmin(db, { role: "admin" });
    const title = `Short sale ${randomInt(1e6)}`;
    await db`insert into promotion (title_en, starts_at, ends_at, placement) values (${title}, '2043-03-03T05:00Z', '2043-03-03T14:00Z', 'card')`;
    await signIn(page, admin, "/admin/promotions");
    await hydrated(page);
    const row = page.getByRole("listitem").filter({ hasText: title });
    await row.getByRole("button", { name: `Turn off: ${title}` }).click();
    await expect(page.getByRole("status").filter({ hasText: "Promotion turned off" })).toBeVisible();
    await expect(row.getByText("Inactive", { exact: true })).toBeVisible();
    page.once("dialog", (dialog) => void dialog.accept());
    await row.getByRole("button", { name: `Delete: ${title}` }).click();
    await expect(page.getByRole("status").filter({ hasText: "Promotion deleted" })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: title })).toHaveCount(0);
    await expect.poll(async () => (await db`select 1 from promotion where title_en = ${title}`).length).toBe(0);
  });

  test("S-053 AC8: a photo is compressed to WebP with its 480/960 copies, saved, and shown on the home card with srcset; a PDF is refused", async ({ page, db, baseURL }) => {
    const admin = await createE2eAdmin(db, { role: "admin" });
    const day = ownDay();
    const title = `Photo week ${randomInt(1e6)}`;
    await signIn(page, admin, "/admin/promotions/new");
    await hydrated(page);
    const photo = page.getByLabel("Choose Photo for the card and banner");

    await photo.setInputFiles([{ name: "menu.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\n") }]);
    await expect(page.getByText("This file is not a photo we can use (JPEG, PNG, WebP or HEIC).")).toBeVisible();

    await photo.setInputFiles(fileURLToPath(new URL("./fixtures/cake-exif.jpg", import.meta.url)));
    await expect(page.getByRole("status").filter({ hasText: "Photo ready. Save to use it." })).toBeAttached({ timeout: 30_000 });
    await page.getByLabel("Title (English)").fill(title);
    await page.getByLabel("Starts").fill(day.starts);
    await page.getByLabel("Ends").fill(day.ends);
    await page.getByRole("radio", { name: "Home card", exact: true }).check();
    await expectNoA11yViolations(page);
    await expectNoHorizontalScroll(page);
    await page.getByRole("button", { name: "Save promotion" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Promotion saved" })).toBeVisible();

    const [stored] = await db<{ image_path: string; image_variants: number[] }[]>`select image_path, image_variants from promotion where title_en = ${title}`;
    expect(stored!.image_path).toMatch(/^promotions\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/);
    expect(stored!.image_variants).toEqual([480, 960]);
    const bytes = Buffer.from(await (await fetch(`http://127.0.0.1:54321/__storage/object?path=${encodeURIComponent(stored!.image_path)}`)).arrayBuffer());
    expect(bytes.subarray(8, 12).toString("latin1")).toBe("WEBP");

    await setClock(page.context(), baseURL!, day.inside);
    await page.goto("/");
    const card = page.getByRole("region", { name: "Current offers" }).getByRole("listitem").filter({ hasText: title }).locator("img");
    await expect(card).toHaveAttribute("loading", "lazy");
    await expect(card).toHaveAttribute("srcset", new RegExp(`${stored!.image_path.replace(/\.webp$/, "-480w\\.webp")} 480w`));
    await expect(card).toHaveAttribute("sizes", /47vw/);
  });

  test("S-052 AC6: a load failure keeps the heading and shows an Alert with Retry; Retry loads the list", async ({ page, db }) => {
    const admin = await createE2eAdmin(db, { role: "admin" });
    const title = `Retry sale ${randomInt(1e6)}`;
    await db`insert into promotion (title_en, starts_at, ends_at, placement) values (${title}, '2044-04-04T05:00Z', '2044-04-04T14:00Z', 'card')`;
    await signIn(page, admin, "/admin/more");
    await hydrated(page);
    await page.route("**/admin/promotions.data*", (route) => route.fulfill({ status: 500, body: "down" }));

    await page.getByRole("link", { name: "Promotions" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "Promotions" })).toBeVisible();
    const alert = page.getByRole("alert").filter({ hasText: "The promotions did not load" });
    await expect(alert).toBeVisible();
    await page.unroute("**/admin/promotions.data*");
    await alert.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("link", { name: `Edit ${title}` })).toBeVisible();
    await expect(alert).toHaveCount(0);
  });
});
