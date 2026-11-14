// E-10 S-197: the Alerts section of My profile, end to end. The e2e Worker has no VAPID keys,
// so push is off for everyone and the screen says so calmly; the device states (off, on,
// blocked, Add to Home Screen) are unit-tested in app/lib/push-device.test.ts and the
// subscribe / test push intents in app/routes/admin/profile.push.test.ts. Keyboard, zoom, tap
// targets and axe for the whole page (this section included) are in admin-profile.spec.ts.
import { expectNoA11yViolations, expectNoHorizontalScroll, expectNothingClipped, expectTapTargets } from "./support/a11y";
import { createE2eAdmin, signIn } from "./support/admin";
import { expect, test } from "./support/fixtures";

test.describe("S-197 profile alerts", () => {
  test("AC2 + AC9: push not set up yet is said calmly in French, no test button, long labels wrap without sideways scroll", async ({ page, db }, testInfo) => {
    const admin = await createE2eAdmin(db, { locale: "fr" });
    await signIn(page, admin, "/admin/profile");
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");

    const alerts = page.getByRole("region", { name: "Alertes" });
    const device = alerts.getByRole("group", { name: "Push sur cet appareil" });
    await expect(device.getByRole("status").filter({ hasText: "Les alertes push ne sont pas encore activées pour l'application." })).toBeVisible();
    await expect(device.getByRole("button", { name: "Envoyer une notification de test" })).toHaveCount(0);
    await expect(device.getByText("Appareils push : 0")).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectNothingClipped(page);
    await expectTapTargets(page);
    await expectNoA11yViolations(page);

    if (testInfo.project.name === "phone-375") {
      await alerts.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath("alerts-profile-fr-375.png"), fullPage: true });
    }
  });

  test("AC10: an anonymous visitor is sent to the admin login with no admin data", async ({ page }) => {
    const response = await page.goto("/admin/profile");
    await expect(page).toHaveURL(/\/admin\/login/);
    expect(await response?.text()).not.toContain("publicKey");
  });
});
