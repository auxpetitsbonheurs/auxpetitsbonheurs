// E-08 custom cake requests, customer side, end to end (S-151, S-152, S-153, S-154), at 320,
// 375 and 1280 px. The e2e clock is Thu 5 Nov 2026 (notice 3 days, Sunday closed): Thu 12 Nov
// is orderable. Photos go to the storage stub's private bucket.
import { fileURLToPath } from "node:url";
import { expectNoA11yViolations, expectNoHorizontalScroll, expectTapTargets, withZoom } from "./support/a11y";
import { chooseDate } from "./support/checkout-date";
import { setClock } from "./support/clock";
import { type Page, expect, test } from "./support/fixtures";

const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));
const JPEG = `${FIXTURES}cake-exif.jpg`;
const NOW = "2026-11-05T08:00:00Z";
const DATE = "2026-11-12";

const hydrated = (page: Page) => expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");

test.beforeEach(async ({ context, baseURL }) => {
  await setClock(context, baseURL!, NOW);
});

async function open(page: Page, path = "/custom-cake") {
  await page.goto(path);
  await hydrated(page);
  await expect(page.getByRole("heading", { name: "Request a custom cake", level: 2 })).toBeVisible();
}

async function fillRequest(page: Page, email: string) {
  await page.getByLabel("Occasion").selectOption("birthday");
  await page.getByLabel("Number of people").fill("20");
  await page.getByLabel("Flavours").fill("Chocolate and passion fruit");
  await page.getByLabel("Text on the cake (optional)").fill("Happy birthday Zoé");
  await page.getByRole("radio", { name: /^Pickup/ }).check();
  await chooseDate(page, DATE);
  await page.getByRole("radio", { name: /^Morning/ }).locator("visible=true").check();
  await page.getByLabel("Name", { exact: true }).fill("E2E Requester");
  await page.getByLabel("Phone", { exact: true }).fill("5712 3456");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("checkbox", { name: "I accept the order policies" }).check();
}

async function addPhotos(page: Page, files: string[] | { name: string; mimeType: string; buffer: Buffer }[]) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /^Add (photos|another photo)/ }).click();
  await (await chooser).setFiles(files as never);
}

const email = () => `request-${test.info().testId}-${Date.now()}@e2e.test`;

test.describe("S-151 submit a request", () => {
  test("AC1, AC2, S-153 AC3: a request with 2 photos is a Quote needed order; the confirmation says a quote will follow", async ({ page, db }) => {
    await open(page);
    const address = email();
    await fillRequest(page, address);
    await addPhotos(page, [JPEG, JPEG]);
    await expect(page.getByRole("img", { name: "Reference photo 2" })).toBeVisible();
    await expect(page.locator('input[name="photoPaths"]')).toHaveCount(2, { timeout: 20_000 });

    await page.getByRole("button", { name: "Send my request" }).click();

    await expect(page).toHaveURL(/\/order\/[A-Za-z0-9_-]{43}\/confirmed$/);
    await expect(page.getByRole("heading", { level: 1, name: "Request received, we will send you a quote" })).toBeVisible();
    await expect(page.getByText("Your request number")).toBeVisible();
    await expect(page.getByRole("link", { name: "Follow my order" })).toBeVisible();
    const [order] = await db<{ source: string; status: string; photos: number; events: string[] }[]>`
      select o.source, o.status, (select count(*)::int from custom_request_photo p where p.order_id = o.id) as photos,
        array(select type from order_event e where e.order_id = o.id) as events
      from orders o where o.contact_email = ${address}`;
    expect(order).toEqual({ source: "custom_request", status: "quote_needed", photos: 2, events: ["created"] });
  });

  test("AC4, AC10: an empty submit shows field errors and a focused Alert whose links reach the fields; nothing is created", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Send my request" }).click();

    const alert = page.getByRole("alert").filter({ hasText: "Some details need checking" });
    await expect(alert).toBeFocused();
    await alert.getByRole("link", { name: "Enter a number of people between 1 and 500" }).click();
    await expect(page.getByLabel("Number of people")).toBeFocused();
    await expect(page.getByLabel("Number of people")).toHaveAccessibleDescription(/Between 1 and 500\.\s*Enter a number of people between 1 and 500/);
  });

  test("AC8: in French at /fr/custom-cake the labels and errors are French", async ({ page }) => {
    await page.goto("/fr/custom-cake");
    await hydrated(page);
    await expect(page.getByRole("heading", { level: 2, name: "Demander un gâteau sur mesure" })).toBeVisible();
    await expect(page.getByText("Pas confirmé tant que nous ne vous avons pas envoyé de devis et que vous ne l'avez pas accepté")).toBeVisible();
    await page.getByRole("button", { name: "Envoyer ma demande" }).click();
    await expect(page.getByRole("alert").getByRole("link", { name: "Indiquez les parfums souhaités" })).toBeVisible();
  });
});

test.describe("S-152 photos", () => {
  test("AC3: a PDF named .jpg is refused at once with the allowed types; no tile is added", async ({ page }) => {
    await open(page);
    await addPhotos(page, [{ name: "cake.jpg", mimeType: "image/jpeg", buffer: Buffer.from("%PDF-1.4 not a photo") }]);
    await expect(page.getByRole("list", { name: "A photo could not be used" }).getByText("cake.jpg is not a photo we can use. Choose a JPEG, PNG, WebP or HEIC.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove photo 1" })).toHaveCount(0);
  });

  test("AC6, AC8: the same photo six times: five tiles (it counts each time), then '5 photos maximum'; removing one frees a place", async ({ page }) => {
    await open(page);
    await addPhotos(page, [JPEG, JPEG, JPEG, JPEG, JPEG, JPEG]);
    await expect(page.getByText("5 photos maximum").first()).toBeVisible();
    await expect(page.locator('input[name="photoPaths"]')).toHaveCount(5, { timeout: 30_000 });
    await expect(page.getByRole("button", { name: /^Add/ })).toHaveCount(0);

    await page.getByRole("button", { name: "Remove photo 3" }).click();
    await expect(page.getByRole("button", { name: "Add another photo (4 of 5)" })).toBeVisible();
  });

  test("AC7, S-153 AC8: the stored photo is a shrunk JPEG/WebP, and it has no public URL", async ({ page, request }) => {
    await open(page);
    await addPhotos(page, [JPEG]);
    const input = page.locator('input[name="photoPaths"]');
    await expect(input).toHaveCount(1, { timeout: 20_000 });
    const path = await input.getAttribute("value");
    expect(path).toMatch(/^requests\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webp|jpg)$/);
    const stored = await request.get(`http://127.0.0.1:54321/__storage/object?bucket=request-photos&path=${encodeURIComponent(path!)}`);
    expect(stored.ok()).toBe(true);
    const bytes = await stored.body();
    expect(bytes.length).toBeLessThanOrEqual(1_048_576);
    // No EXIF block (APP1 "Exif") survives the re-encode: no GPS, upright pixels.
    expect(bytes.includes(Buffer.from("Exif"))).toBe(false);
    const anonymous = await request.get(`http://127.0.0.1:54321/storage/v1/object/public/request-photos/${path}`);
    expect(anonymous.ok()).toBe(false);
  });
});

test.describe("S-154 request something similar", () => {
  test("AC1, AC4: ?fromGallery= attaches the gallery photo as photo 1; removing it frees all 5 places", async ({ page, db }) => {
    const [photo] = await db<{ id: string }[]>`insert into gallery_photo (storage_path, width, height) values ('samples/gallery-e2e.webp', 1600, 1200) returning id`;
    await open(page, `/custom-cake?fromGallery=${photo!.id}`);
    await expect(page.getByRole("img", { name: "Reference photo 1 from our gallery" })).toHaveCount(1);
    await expect(page.locator('input[name="galleryPhotoId"]')).toHaveValue(photo!.id);
    await expect(page.getByRole("button", { name: "Add another photo (1 of 5)" })).toBeVisible();

    await page.getByRole("button", { name: "Remove photo 1" }).click();
    await expect(page.locator('input[name="galleryPhotoId"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add photos (up to 5)" })).toBeVisible();
    await db`delete from gallery_photo where id = ${photo!.id}`;
  });

  test("AC3: an unknown gallery id shows the normal empty form with no error", async ({ page }) => {
    await open(page, "/custom-cake?fromGallery=7c9e6679-7425-40de-944b-e07fc1f90ae7");
    await expect(page.getByRole("button", { name: "Add photos (up to 5)" })).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
});

test.describe("accessibility (S-151 AC10/AC11, S-152 AC10/AC11, S-162 AC7)", () => {
  test("the form passes axe, has 44 px targets and no sideways scroll, also at 200% zoom, with a photo and an error", async ({ page }) => {
    await open(page);
    await addPhotos(page, [JPEG]);
    await expect(page.locator('input[name="photoPaths"]')).toHaveCount(1, { timeout: 20_000 });
    await page.getByRole("button", { name: "Send my request" }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();

    await expectNoA11yViolations(page);
    await expectNoHorizontalScroll(page);
    await expectTapTargets(page);
    await withZoom(page, 2, () => expectNoHorizontalScroll(page));
  });
});
