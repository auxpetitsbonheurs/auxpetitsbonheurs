// S-058 business settings and S-059 site content, end to end. Saves run under the Settings
// lock and put back what they change (the row is shared by every spec); checks of the page
// itself run in every project (320, 375 and 1280 px).
import {
  expectKeyboardOperable,
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  expectNothingClipped,
  expectTapTargets,
  withZoom,
} from "./support/a11y";
import { createE2eAdmin, signIn } from "./support/admin";
import { E2E_ACCOUNTS } from "./support/database";
import { type Page, expect, test } from "./support/fixtures";
import { withSettingsLock } from "./support/settings-lock";

async function openSettings(page: Page) {
  await page.goto("/admin/settings");
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
}

const save = (page: Page) => page.getByRole("button", { name: "Save settings" }).click();

test.describe("S-058, S-059 Settings", () => {
  test("S-058 AC1, AC10 + S-059 AC4: values shown, errors linked with the summary focused, Saved announced", async ({ page, db }, testInfo) => {
    test.skip(testInfo.project.name !== "phone-375", "saves the shared Settings row: one project is enough");
    const owner = E2E_ACCOUNTS.owner;
    await signIn(page, owner, "/admin/settings");
    await withSettingsLock(db, async () => {
      await openSettings(page);
      await expect(page.getByLabel("Delivery fee (Rs)")).toHaveValue("200");
      await expect(page.getByLabel("Order number prefix")).toHaveValue("APB-");
      await expect(page.getByRole("textbox", { name: "Email (optional)" })).toHaveAttribute("type", "email");
      await expect(page.getByRole("textbox", { name: /^Phone/ })).toHaveAttribute("type", "tel");
      await expect(page.getByRole("textbox", { name: /^Map link/ })).toHaveAttribute("type", "url");
      await expect(page.getByLabel("Delivery fee (Rs)")).toHaveAttribute("inputmode", "numeric");
      // E-10 (emails job): the live count replaces the placeholder.
      await expect(page.getByText(/^Email usage: \d+ of \d+ today$/)).toBeVisible();
      // Shared row: what this test changes is put back as found (content-pages reads the email).
      const email = await page.getByRole("textbox", { name: "Email (optional)" }).inputValue();
      const about = await page.getByLabel("About text (English)").inputValue();

      await page.getByLabel("Delivery fee (Rs)").fill("lots");
      await page.getByRole("textbox", { name: "Email (optional)" }).fill("not-an-email");
      await save(page);
      const summary = page.getByRole("alert").filter({ hasText: "Check these fields" });
      await expect(summary).toBeFocused();
      await summary.getByRole("link", { name: "Enter the delivery fee as whole rupees from 0 to 100,000." }).click();
      await expect(page.getByLabel("Delivery fee (Rs)")).toBeFocused();
      await expect(page.getByLabel("Delivery fee (Rs)")).toHaveAttribute("aria-invalid", "true");

      await page.getByLabel("Delivery fee (Rs)").fill("200");
      await page.getByRole("textbox", { name: "Email (optional)" }).fill(email);
      await page.getByLabel("About text (English)").fill("We bake in Beau Bassin.\n<b>Every</b> cake to order.");
      await save(page);
      await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
      // The e2e policies have no "storage" entry: saved, with the warning in words.
      await expect(page.getByText("Keep the cancellation and storage entries in the policies (English and French).")).toBeVisible();

      await page.reload();
      await expect(page.getByLabel("About text (English)")).toHaveValue("We bake in Beau Bassin.\n<b>Every</b> cake to order.");
      await page.getByLabel("About text (English)").fill(about);
      await save(page);
      await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
      await expect(page.getByRole("textbox", { name: "Email (optional)" })).toHaveValue(email);
    });
    // After the lock (it holds this worker's only connection): the shared row is as found.
    const [stored] = await db<{ contact_email: string | null }[]>`select contact_email from settings`;
    expect(stored?.contact_email ?? "").toBe("hello@example.com");
  });

  test("S-058 AC7: a second Owner saving a stale page sees Someone changed this, Reload", async ({ page, browser, db }, testInfo) => {
    test.skip(testInfo.project.name !== "phone-375", "saves the shared Settings row: one project is enough");
    const owner = E2E_ACCOUNTS.owner;
    await signIn(page, owner, "/admin/settings");
    const other = await browser.newPage();
    await signIn(other, owner, "/admin/settings");
    await withSettingsLock(db, async () => {
      await openSettings(page);
      await openSettings(other);
      await save(page);
      await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();

      await other.getByLabel("Juice number (optional)").fill("5999 9999");
      await save(other);
      const changed = other.getByRole("alert").filter({ hasText: "Someone changed this. Reload." });
      await expect(changed).toBeFocused();
      await changed.getByRole("link", { name: "Reload" }).click();
      await expect(other.getByLabel("Juice number (optional)")).toHaveValue("5000 0000");
    });
    await other.close();
  });

  test("S-058 AC9 + S-059 AC9: keyboard, 200% zoom, 44 px targets, no sideways scroll; EN and FR stacked on phones", async ({ page }) => {
    const owner = E2E_ACCOUNTS.owner;
    await signIn(page, owner, "/admin/settings");
    await openSettings(page);
    const english = await page.getByLabel("About text (English)").boundingBox();
    const french = await page.getByLabel("About text (French)").boundingBox();
    const wide = (page.viewportSize()?.width ?? 0) >= 768;
    expect(wide ? Math.abs(english!.y - french!.y) < 2 : french!.y > english!.y + english!.height).toBe(true);
    for (const zoom of [1, 2]) {
      await withZoom(page, zoom, async () => {
        await expectNoHorizontalScroll(page);
        await expectNothingClipped(page);
        await expectTapTargets(page);
      });
    }
    // One Save stays reachable at the bottom of the screen.
    await expect(page.getByRole("button", { name: "Save settings" })).toBeInViewport();
    const pin = await page.addStyleTag({ content: "[data-bottom-bar] { display: block !important; }" });
    await expectKeyboardOperable(page, 400);
    await pin.evaluate((style) => (style as Element).remove());
  });

  test("S-058 AC10 + S-059 AC10: labels name their language, the count is a hint, axe clean light and dark", async ({ page }) => {
    const owner = E2E_ACCOUNTS.owner;
    await signIn(page, owner, "/admin/settings");
    await openSettings(page);
    const tagline = page.getByRole("textbox", { name: "Tagline (French)" });
    await expect(tagline).toHaveAccessibleDescription(/200 characters left/);
    await tagline.fill("Bonjour");
    await expect(page.locator("#hero-tagline-fr-count")).toHaveText("193 characters left");
    await expectNoA11yViolations(page);
    await page.emulateMedia({ colorScheme: "dark" });
    await expectNoA11yViolations(page);
  });

  test("S-283 AC1, AC2: a Facebook page that is not https on facebook.com is refused and nothing is saved", async ({ page, db }, testInfo) => {
    test.skip(testInfo.project.name !== "phone-375", "posts to the shared Settings row: one project is enough");
    test.slow(); // may wait for the Settings lock behind the footer spec's saves
    await signIn(page, E2E_ACCOUNTS.owner, "/admin/settings");
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
    await withSettingsLock(db, async () => {
      const field = page.getByRole("textbox", { name: /^Facebook page/ });
      await expect(field).toHaveValue("");
      await field.fill("http://facebook.example/apb");
      await save(page);
      await expect(page.getByText("Enter the Facebook page as a full address starting with https://, on facebook.com").first()).toBeVisible();
    });
    // After the lock: it holds this worker's only connection.
    const [stored] = await db<{ facebook_url: string | null }[]>`select facebook_url from settings`;
    expect(stored?.facebook_url).toBeNull();
  });

  test("S-058 AC8: an Admin gets Owner only and no Settings data", async ({ page, db }) => {
    const helper = await createE2eAdmin(db, { role: "admin" });
    await signIn(page, helper, "/admin/settings");
    await expect(page.getByRole("heading", { name: "Owner only" })).toBeVisible();
    await expect(page.getByText("5000 0000")).toHaveCount(0);
  });
});
