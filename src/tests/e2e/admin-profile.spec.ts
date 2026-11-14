// S-036 My profile, end to end (own throwaway admin per spec: it changes the account).
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

/** Keyboard walk with the bottom bar pinned: on phones it leaves while a text field has focus (S-033 AC5), renumbering the stops. */
async function expectFormKeyboardOperable(page: Page) {
  const pin = await page.addStyleTag({ content: "[data-bottom-bar] { display: block !important; }" });
  try {
    await expectKeyboardOperable(page);
  } finally {
    await pin.evaluate((style) => (style as Element).remove());
  }
}

async function openProfile(page: Page) {
  await page.goto("/admin/profile");
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
}

test.describe("S-036 My profile", () => {
  test("AC1 + AC4 + AC6: save name and French, switch push off; Saved is announced and survives reload", async ({ page, db }) => {
    const admin = await createE2eAdmin(db, { name: "Profile Tester" });
    await signIn(page, admin, "/admin/profile");
    await openProfile(page);
    await expect(page.getByText("Push devices: 0")).toBeVisible();
    await expect(page.getByText("Turning on push on this device is added with notifications")).toBeVisible();

    const details = page.getByRole("region", { name: "Name and language" });
    await details.getByLabel("Name", { exact: true }).fill("Profile Tester 2");
    await details.getByRole("radio", { name: "Français" }).check();
    await details.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Mon profil" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Nom et langue" }).getByRole("status").filter({ hasText: "Enregistré" })).toBeVisible();

    const alerts = page.getByRole("region", { name: "Alertes" });
    const push = alerts.getByRole("switch", { name: "Alertes push" });
    await expect(push).toBeChecked();
    await push.uncheck();
    await alerts.getByRole("button", { name: "Enregistrer les alertes" }).click();
    await expect(alerts.getByRole("status").filter({ hasText: "Enregistré" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("switch", { name: "Alertes push" })).not.toBeChecked();
    await expect(page.getByRole("switch", { name: "Alertes par e-mail" })).toBeChecked();
    await expect(page.getByLabel("Nom", { exact: true })).toHaveValue("Profile Tester 2");
  });

  test("AC3: changing the password keeps this session signed in", async ({ page, db }) => {
    const admin = await createE2eAdmin(db);
    await signIn(page, admin, "/admin/profile");
    await openProfile(page);

    const section = page.getByRole("region", { name: "Password" });
    await section.getByLabel("Current password", { exact: true }).fill(admin.password);
    await section.getByLabel("New password", { exact: true }).fill("another long password");
    await section.getByRole("button", { name: "Change password" }).click();
    await expect(section.getByRole("status").filter({ hasText: "Password changed. You stay signed in here; your other devices are signed out." })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "My profile" })).toBeVisible();
  });

  test("AC7: keyboard, zoom, 44 px targets and no sideways scroll", async ({ page, db }) => {
    const admin = await createE2eAdmin(db);
    await signIn(page, admin, "/admin/profile");
    await openProfile(page);
    for (const zoom of [1, 2]) {
      await withZoom(page, zoom, async () => {
        await expectNoHorizontalScroll(page);
        await expectNothingClipped(page);
        await expectTapTargets(page);
        await expectFormKeyboardOperable(page);
      });
    }
  });

  test("AC8: labelled fields and switches, errors linked with the summary focused, axe clean light and dark", async ({ page, db }) => {
    const admin = await createE2eAdmin(db);
    await signIn(page, admin, "/admin/profile");
    await openProfile(page);
    await expect(page.getByRole("switch", { name: "Push alerts" })).toBeVisible();
    await expect(page.getByRole("switch", { name: "Email alerts" })).toBeVisible();

    const details = page.getByRole("region", { name: "Name and language" });
    await details.getByLabel("Name", { exact: true }).fill("");
    await details.getByRole("button", { name: "Save" }).click();
    const summary = details.getByRole("alert");
    await expect(summary).toBeFocused();
    await summary.getByRole("link", { name: "Enter your name (80 characters or fewer)." }).click();
    await expect(details.getByLabel("Name", { exact: true })).toBeFocused();
    await expect(details.getByLabel("Name", { exact: true })).toHaveAttribute("aria-invalid", "true");

    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await expectNoA11yViolations(page);
    }
  });
});
