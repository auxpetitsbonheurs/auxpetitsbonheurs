// E-10 S-202: Settings > WhatsApp messages. The live preview follows typing, an unknown
// placeholder is refused on its field, widths and axe; an Admin who is not Owner is refused.
// Saving touches the shared Settings row: only phone-375 saves, under the Settings lock.
import { expectNoA11yViolations, expectNoHorizontalScroll, expectNothingClipped, expectTapTargets } from "./support/a11y";
import { signIn } from "./support/admin";
import { E2E_ACCOUNTS } from "./support/database";
import { expect, test } from "./support/fixtures";
import { withSettingsLock } from "./support/settings-lock";

const SHOTS = "/tmp/claude-0/-home-user-auxpetitsbonheurs/9106cb54-2393-55df-a3cb-bd8500903b6a/scratchpad";

test.describe("S-202 WhatsApp templates", () => {
  test("AC1 + AC6 + AC8: five templates with a live preview per language; an empty French text says the English one is used", async ({ page }, testInfo) => {
    await signIn(page, E2E_ACCOUNTS.owner, "/admin/settings");
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
    const section = page.getByRole("region", { name: "WhatsApp messages" });
    await expect(section.getByRole("group")).toHaveCount(5);

    const blank = section.getByRole("textbox", { name: "Blank message (English)" });
    await blank.fill("Hi {name}, order {order_number}");
    await expect(section.getByText("Hi Aisha, order APB-0042")).toBeVisible();
    await section.getByRole("textbox", { name: "Blank message (French)" }).fill("");
    await expect(section.getByText("EN text will be used")).toBeVisible();

    await expectNoHorizontalScroll(page);
    await expectNothingClipped(page);
    await expectTapTargets(page);
    await expectNoA11yViolations(page);
    if (testInfo.project.name === "phone-375") {
      await section.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${SHOTS}/alerts-settings-whatsapp-375.png` });
    }
  });

  test("AC3 + AC7: an unknown placeholder is refused on that field, linked from the summary; nothing is saved", async ({ page, db }, testInfo) => {
    test.skip(testInfo.project.name !== "phone-375", "saves the shared Settings row: one project is enough");
    await signIn(page, E2E_ACCOUNTS.owner, "/admin/settings");
    await withSettingsLock(db, async () => {
      await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
      const field = page.getByRole("textbox", { name: "Order ready (French)" });
      await field.fill("Prête {foo}");
      await page.getByRole("button", { name: "Save settings" }).click();
      const message = "Order ready (French): use only the placeholders listed above.";
      await page.getByRole("link", { name: message }).click();
      await expect(field).toBeFocused();
      await expect(field).toHaveAttribute("aria-invalid", "true");
    });
    // Outside the lock: it holds the fixture's connection.
    const [row] = await db<{ whatsapp_templates: unknown }[]>`select whatsapp_templates from settings`;
    expect(JSON.stringify(row?.whatsapp_templates ?? null)).not.toContain("{foo}");
  });

  test("AC4: an Admin who is not Owner cannot open Settings", async ({ page }) => {
    await signIn(page, E2E_ACCOUNTS.helper, "/admin/settings");
    await expect(page.getByRole("region", { name: "WhatsApp messages" })).toHaveCount(0);
  });
});
