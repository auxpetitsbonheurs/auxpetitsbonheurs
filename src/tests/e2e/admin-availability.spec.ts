// S-056 rules and S-057 blocked dates, end to end. Saves run under the Settings lock and put
// back what they change; page checks run in every project (320, 375 and 1280 px).
import {
  expectKeyboardOperable,
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  expectNothingClipped,
  expectTapTargets,
  withZoom,
} from "./support/a11y";
import { createE2eAdmin, signIn } from "./support/admin";
import { type Page, expect, test } from "./support/fixtures";
import { withSettingsLock } from "./support/settings-lock";

async function openAvailability(page: Page) {
  await page.goto("/admin/availability");
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
  await expect(page.getByRole("heading", { level: 1, name: "Availability" })).toBeVisible();
}

const saved = (page: Page) => expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();

test.describe("S-056, S-057 Availability", () => {
  test("S-056 AC1, AC3, AC4, AC10: rules shown; an overlap is linked from the summary; a window added then removed", async ({ page, db }, testInfo) => {
    test.skip(testInfo.project.name !== "phone-375", "saves the shared Settings row: one project is enough");
    const owner = await createE2eAdmin(db, { role: "owner" });
    await signIn(page, owner, "/admin/availability");
    await withSettingsLock(db, async () => {
      await openAvailability(page);
      await expect(page.getByLabel("Notice needed (days)")).toHaveValue("3");
      await expect(page.getByRole("checkbox", { name: "Closed on Sunday" })).toBeChecked();
      await expect(page.getByRole("checkbox", { name: "Closed on Monday" })).not.toBeChecked();
      await expect(page.getByRole("textbox", { name: "Delivery window 1 Start" })).toHaveValue("09:00");
      await expect(page.getByRole("textbox", { name: "Pickup window 3 End" })).toHaveValue("20:00");
      await expect(page.getByRole("textbox", { name: "Delivery window 2 Start" })).toHaveAccessibleDescription("Times as HH:mm, 24-hour, for example 09:00.");

      await page.getByRole("button", { name: "Add a pickup window" }).click();
      await expect(page.getByRole("textbox", { name: "Pickup window 4 Name (English)" })).toBeFocused();
      await page.getByRole("textbox", { name: "Pickup window 4 Name (English)" }).fill("Late");
      await page.getByRole("textbox", { name: "Pickup window 4 Start" }).fill("19:00");
      await page.getByRole("textbox", { name: "Pickup window 4 End" }).fill("21:00");
      await page.getByRole("button", { name: "Save availability" }).click();
      const summary = page.getByRole("alert").filter({ hasText: "Check these fields" });
      await expect(summary).toBeFocused();
      await summary.getByRole("link", { name: "Pickup windows overlap. Change the times so they do not." }).click();
      await expect(page.locator("#pickup")).toBeFocused();

      await page.getByRole("textbox", { name: "Pickup window 4 Start" }).fill("20:00");
      await page.getByRole("button", { name: "Save availability" }).click();
      await saved(page);

      await openAvailability(page);
      await expect(page.getByRole("textbox", { name: "Pickup window 4 Name (English)" })).toHaveValue("Late");
      await page.getByRole("button", { name: "Remove Pickup window 4" }).click();
      await page.getByRole("button", { name: "Save availability" }).click();
      await saved(page);
      await page.reload();
      await expect(page.getByRole("textbox", { name: "Pickup window 4 Name (English)" })).toHaveCount(0);
    });
  });

  test("S-057 AC1, AC4, AC5, AC9: block a range, see it listed, remove it through the dialog; No blocked dates", async ({ page, db }, testInfo) => {
    test.skip(testInfo.project.name !== "phone-375", "changes the shared blocked dates: one project is enough");
    const owner = await createE2eAdmin(db, { role: "owner" });
    await signIn(page, owner, "/admin/availability");
    await withSettingsLock(db, async () => {
      await openAvailability(page);
      const blocked = page.getByRole("region", { name: "Blocked dates" });
      await expect(blocked.getByText("No blocked dates.")).toBeVisible();
      await expect(blocked.getByLabel("First day")).toHaveAccessibleDescription("Date as YYYY-MM-DD.");

      await blocked.getByLabel("First day").fill("2027-12-24");
      await blocked.getByLabel("Last day").fill("2027-12-23");
      await blocked.getByRole("button", { name: "Block these dates" }).click();
      await expect(blocked.getByRole("alert").filter({ hasText: "Check these fields" })).toBeFocused();

      await blocked.getByLabel("Last day").fill("2028-01-02");
      await blocked.getByLabel("Reason (optional)").fill("Christmas holidays");
      await blocked.getByRole("button", { name: "Block these dates" }).click();
      await expect(blocked.getByRole("status").filter({ hasText: "Blocked Fri 24 Dec 2027 to Sun 2 Jan 2028." })).toBeVisible();
      await expect(blocked.getByText("Christmas holidays")).toBeVisible();

      const remove = blocked.getByRole("button", { name: "Remove block Fri 24 Dec 2027 to Sun 2 Jan 2028" });
      await remove.click();
      const dialog = page.getByRole("dialog", { name: "Remove this block?" });
      await expect(dialog).toBeVisible();
      for (let i = 0; i < 4; i += 1) await page.keyboard.press("Tab");
      await expect(dialog.locator(":focus")).toHaveCount(1);
      await dialog.getByRole("button", { name: "Remove block" }).click();
      await expect(blocked.getByText("No blocked dates.")).toBeVisible();
      await page.reload();
      await expect(page.getByText("No blocked dates.")).toBeVisible();
    });
  });

  test("S-056 AC9 + S-057 AC8: keyboard, 200% zoom, 44 px targets and no sideways scroll", async ({ page, db }) => {
    const owner = await createE2eAdmin(db, { role: "owner" });
    await signIn(page, owner, "/admin/availability");
    await openAvailability(page);
    for (const zoom of [1, 2]) {
      await withZoom(page, zoom, async () => {
        await expectNoHorizontalScroll(page);
        await expectNothingClipped(page);
        await expectTapTargets(page);
      });
    }
    const pin = await page.addStyleTag({ content: "[data-bottom-bar] { display: block !important; }" });
    await expectKeyboardOperable(page, 120);
    await pin.evaluate((style) => (style as Element).remove());
  });

  test("S-056 AC10 + S-057 AC9: axe clean light and dark", async ({ page, db }) => {
    const owner = await createE2eAdmin(db, { role: "owner" });
    await signIn(page, owner, "/admin/availability");
    await openAvailability(page);
    await expectNoA11yViolations(page);
    await page.emulateMedia({ colorScheme: "dark" });
    await expectNoA11yViolations(page);
  });

  test("S-056 AC8: an Admin gets Owner only", async ({ page, db }) => {
    const helper = await createE2eAdmin(db, { role: "admin" });
    await signIn(page, helper, "/admin/availability");
    await expect(page.getByRole("heading", { name: "Owner only" })).toBeVisible();
  });
});
