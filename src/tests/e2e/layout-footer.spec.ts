// S-061: the footer from Settings in the real app, at 320, 375 and 1280 px. The e2e seed sets
// placeholder WhatsApp and phone numbers (the email may be cleared by the Settings spec).
import { signIn } from "./support/admin";
import { expectNoA11yViolations, expectNoHorizontalScroll, expectTapTargets, withZoom } from "./support/a11y";
import { E2E_ACCOUNTS } from "./support/database";
import { type Page, expect, test } from "./support/fixtures";
import { withSettingsLock } from "./support/settings-lock";

const footer = (page: Page) => page.getByRole("contentinfo");

async function open(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
}

test.describe("footer from Settings (S-061)", () => {
  test("AC1, AC4: contact links and the site pages, in English and in French", async ({ page }) => {
    await open(page, "/menu");
    await expect(footer(page).getByRole("link", { name: "WhatsApp +230 5000 0000" })).toHaveAttribute("href", "https://wa.me/23050000000");
    await expect(footer(page).getByRole("link", { name: "Phone +230 5000 0001" })).toHaveAttribute("href", "tel:+23050000001");
    await expect(footer(page).getByRole("link", { name: "Our story" })).toHaveAttribute("href", "/our-story");

    await open(page, "/fr/menu");
    await expect(footer(page).getByRole("heading", { name: "Contacter la pâtisserie" })).toBeVisible();
    await expect(footer(page).getByRole("link", { name: "Téléphone +230 5000 0001" })).toBeVisible();
    await expect(footer(page).getByRole("link", { name: "Notre histoire" })).toHaveAttribute("href", "/fr/our-story");
  });

  test("AC5: 44 px targets, visible focus, no sideways scroll, axe clean, also at 200% zoom and in dark mode", async ({ page }) => {
    await open(page, "/contact");
    await footer(page).scrollIntoViewIfNeeded();
    await expectNoHorizontalScroll(page);
    await expectTapTargets(page);
    await withZoom(page, 2, async () => {
      await expectNoHorizontalScroll(page);
      await expectTapTargets(page);
    });
    const phone = footer(page).getByRole("link", { name: /^Phone/ });
    await phone.focus();
    await expect(phone).toHaveCSS("outline-style", "solid");
    await expectNoA11yViolations(page);
    await page.emulateMedia({ colorScheme: "dark" });
    await expectNoA11yViolations(page);
  });

  test("AC2, AC3, AC6 + S-283: an Owner's Instagram and Facebook show as icons on the next request; empty values leave no item", async ({ page, db }, testInfo) => {
    test.skip(testInfo.project.name !== "phone-375", "saves the shared Settings row: one project is enough");
    test.slow(); // two Settings saves and axe at three widths
    await signIn(page, E2E_ACCOUNTS.owner, "/admin/settings");
    await withSettingsLock(db, async () => {
      const setSocial = async (instagram: string, facebook: string) => {
        await page.goto("/admin/settings");
        await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
        await page.getByRole("textbox", { name: /^Instagram link/ }).fill(instagram);
        await page.getByRole("textbox", { name: /^Facebook page/ }).fill(facebook);
        await page.getByRole("button", { name: "Save settings" }).click();
        await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
      };
      try {
        await setSocial("https://instagram.com/apb-e2e", "https://www.facebook.com/apb-e2e");
        await open(page, "/");
        const instagram = footer(page).getByRole("link", { name: "Aux petits bonheurs on Instagram" });
        const facebook = footer(page).getByRole("link", { name: "Aux petits bonheurs on Facebook" });
        await expect(instagram).toHaveAttribute("href", "https://instagram.com/apb-e2e");
        await expect(facebook).toHaveAttribute("href", "https://www.facebook.com/apb-e2e");
        for (const link of [instagram, facebook]) {
          await expect(link).toHaveAttribute("target", "_blank");
          await expect(link).toHaveAttribute("rel", "noopener noreferrer");
          await expect(link).toHaveAccessibleDescription("(opens in a new tab)");
        }
        await facebook.focus();
        await expect(facebook).toHaveCSS("outline-style", "solid");
        for (const width of [320, 375, 1280]) {
          await page.setViewportSize({ width, height: 800 });
          await footer(page).scrollIntoViewIfNeeded();
          for (const link of [instagram, facebook]) {
            const box = await link.boundingBox();
            expect(box?.width).toBeGreaterThanOrEqual(44);
            expect(box?.height).toBeGreaterThanOrEqual(44);
          }
          await expectNoHorizontalScroll(page);
          await expectNoA11yViolations(page);
        }
        await page.setViewportSize({ width: 375, height: 667 });

        await open(page, "/fr");
        await expect(footer(page).getByRole("link", { name: "Aux petits bonheurs sur Instagram" })).toBeVisible();
        await expect(footer(page).getByRole("link", { name: "Aux petits bonheurs sur Facebook" })).toBeVisible();
      } finally {
        await setSocial("", "");
      }
      await open(page, "/");
      await expect(footer(page).getByRole("link", { name: /Instagram|Facebook/ })).toHaveCount(0);
      await expect(footer(page).getByRole("list", { name: "Follow us" })).toHaveCount(0);
      await expect(footer(page).locator('a[href=""]')).toHaveCount(0);
    });
  });
});
