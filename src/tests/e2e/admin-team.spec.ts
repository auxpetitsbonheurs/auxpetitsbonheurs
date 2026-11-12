// E-02 Team: list (S-027), invite sheet (S-028), resend and revoke (S-030), as the shared
// e2e Owner. Every spec invites its own unique address; Resend is not configured in e2e, so
// each invitation shows "Email not sent, resend" (the sender is proven in unit tests).
import { randomUUID } from "node:crypto";
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

const hydrated = (page: Page) => expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
/** The team grows as other specs add admins; Tab through all of it. */
const TEAM_TAB_LIMIT = 400;

const uniqueEmail = () => `helper-${randomUUID().slice(0, 8)}@e2e.test`;

async function openTeam(page: Page) {
  await signIn(page, E2E_ACCOUNTS.owner, "/admin/team");
  await hydrated(page);
  await expect(page.getByRole("heading", { level: 1, name: "Team" })).toBeVisible();
}

async function invite(page: Page, person: { name: string; email: string; role?: "Admin" | "Owner"; language?: "English" | "Français" }) {
  await page.getByRole("button", { name: "Invite a helper" }).click();
  const sheet = page.getByRole("dialog", { name: "Invite a helper" });
  await sheet.getByLabel("Name").fill(person.name);
  await sheet.getByLabel("Email").fill(person.email);
  await sheet.getByRole("radio", { name: person.role ?? "Admin" }).check();
  await sheet.getByRole("radio", { name: person.language ?? "English" }).check();
  await sheet.getByRole("button", { name: "Send invitation" }).click();
  await expect(sheet).toBeHidden();
}

const inviteRow = (page: Page, email: string) => page.getByRole("region", { name: "Waiting invitations" }).getByRole("listitem").filter({ hasText: email });

async function dismissToasts(page: Page) {
  for (const button of await page.getByRole("button", { name: "Dismiss" }).all()) await button.click();
}

test.describe("S-027 Team list", () => {
  test("AC1, AC6: admins with role, status and last sign-in; one named Actions button per row opening its sheet", async ({ page }) => {
    await openTeam(page);
    const people = page.getByRole("region", { name: "People with access" });
    const me = people.getByRole("listitem").filter({ hasText: `${E2E_ACCOUNTS.owner.name} (you)` });
    await expect(me).toContainText("Owner");
    await expect(me).toContainText("Active");
    await expect(me).toContainText(/Last sign in \w{3} \d{1,2} \w{3} \d{2}:\d{2}/);

    await me.getByRole("button", { name: `Actions for ${E2E_ACCOUNTS.owner.name}` }).click();
    const sheet = page.getByRole("dialog", { name: E2E_ACCOUNTS.owner.name });
    await expect(sheet).toContainText("Changing the role and deactivating are coming soon.");
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(me.getByRole("button", { name: `Actions for ${E2E_ACCOUNTS.owner.name}` })).toBeFocused();
  });

  test("AC5: a slow load shows skeleton rows after 300 ms, then the team", async ({ page }) => {
    await signIn(page, E2E_ACCOUNTS.owner, "/admin/more");
    await hydrated(page);
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/admin/team.data*", async (route) => {
      await held;
      await route.continue();
    });

    await page.getByRole("link", { name: "Team" }).click();

    await expect(page.getByTestId("team-skeleton")).toBeVisible();
    release();
    await expect(page.getByRole("heading", { level: 1, name: "Team" })).toBeVisible();
    await expect(page.getByTestId("team-skeleton")).toHaveCount(0);
  });

  test("AC5: a load failure shows an Alert with Retry, and Retry loads the team", async ({ page }) => {
    await signIn(page, E2E_ACCOUNTS.owner, "/admin/more");
    await hydrated(page);
    await page.route("**/admin/team.data*", (route) => route.fulfill({ status: 500, body: "down" }));

    await page.getByRole("link", { name: "Team" }).click();

    const alert = page.getByRole("alert").filter({ hasText: "The team did not load" });
    await expect(alert).toBeVisible();
    await page.unroute("**/admin/team.data*");
    await alert.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("region", { name: "People with access" })).toBeVisible();
  });

  test("AC7, AC8: keyboard, visible focus, no clipping or sideways scroll, 44 px targets at 100% and 200%; axe clean light and dark", async ({ page }) => {
    test.slow();
    await openTeam(page);
    for (const zoom of [1, 2]) {
      await withZoom(page, zoom, async () => {
        await expectNoHorizontalScroll(page);
        await expectNothingClipped(page);
        await expectTapTargets(page);
        await expectKeyboardOperable(page, TEAM_TAB_LIMIT);
      });
    }
    await expect(page.getByRole("region", { name: "People with access" }).getByRole("list")).toBeVisible();
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await expectNoA11yViolations(page);
    }
  });
});

test.describe("S-028 invite a helper", () => {
  test("AC1, AC3: sending shows the toast and the pending row with its expiry; without email it says to resend", async ({ page }) => {
    const email = uniqueEmail();
    await openTeam(page);

    await invite(page, { name: "Anna Helper", email, language: "Français" });

    await expect(page.getByText(`Invitation saved for ${email}, but the email was not sent. Use Resend.`)).toBeVisible();
    const row = inviteRow(page, email);
    await expect(row).toContainText("Anna Helper");
    await expect(row).toContainText("Admin");
    await expect(row).toContainText(/valid until \w{3} \d{1,2} \w{3}/);
    await expect(row).toContainText("Email not sent, resend");
  });

  test("AC4, AC8: errors per field with the summary focused; EMAIL_IN_USE on email; Esc closes and focus returns", async ({ page }) => {
    await openTeam(page);
    const trigger = page.getByRole("button", { name: "Invite a helper" });
    await trigger.click();
    const sheet = page.getByRole("dialog", { name: "Invite a helper" });
    await expect(sheet.getByRole("heading", { name: "Invite a helper" })).toBeFocused();

    await sheet.getByRole("button", { name: "Send invitation" }).click();
    const summary = sheet.getByRole("alert");
    await expect(summary).toBeFocused();
    await summary.getByRole("link", { name: "Enter an email address, for example name@example.com." }).click();
    await expect(sheet.getByLabel("Email")).toBeFocused();
    await expect(sheet.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
    await expect(sheet.getByLabel("Name")).toHaveAttribute("aria-describedby", "invite-name-error");

    await sheet.getByLabel("Name").fill("Owner again");
    await sheet.getByLabel("Email").fill(E2E_ACCOUNTS.owner.email);
    await sheet.getByRole("button", { name: "Send invitation" }).click();
    await expect(sheet.getByText("This email already has an account.").first()).toBeVisible();
    await expect(sheet).toBeVisible();

    // Tab stays inside the sheet.
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press("Tab");
      expect(await sheet.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("AC9: the sheet at 100% and 200%: no clipping or sideways scroll, 44 px targets, axe clean light and dark", async ({ page }) => {
    await openTeam(page);
    await page.getByRole("button", { name: "Invite a helper" }).click();
    const sheet = page.getByRole("dialog", { name: "Invite a helper" });
    await sheet.getByRole("button", { name: "Send invitation" }).click();
    await expect(sheet.getByRole("alert")).toBeFocused();
    for (const zoom of [1, 2]) {
      await withZoom(page, zoom, async () => {
        await expectNoHorizontalScroll(page);
        await expectTapTargets(page);
      });
    }
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await expectNoA11yViolations(page);
    }
  });
});

test.describe("S-030 resend or revoke", () => {
  test("AC1, AC5, AC6: Resend gives a new link (the row stays, email still not sent) and is announced", async ({ page }) => {
    const email = uniqueEmail();
    await openTeam(page);
    await invite(page, { name: "Resend Me", email });
    await dismissToasts(page);

    await inviteRow(page, email).getByRole("button", { name: "Actions for Resend Me" }).click();
    const sheet = page.getByRole("dialog", { name: "Resend Me" });
    await sheet.getByRole("button", { name: `Resend invitation to ${email}` }).click();

    await expect(sheet).toBeHidden();
    await expect(page.getByRole("status").filter({ hasText: `Invitation saved for ${email}, but the email was not sent. Use Resend.` })).toBeVisible();
    await expect(inviteRow(page, email)).toHaveCount(1);
    await expect(inviteRow(page, email)).toContainText("Email not sent, resend");
  });

  test("AC2, AC6, AC7: Revoke asks first, Keep returns focus, Revoke removes the row and is announced", async ({ page }) => {
    const email = uniqueEmail();
    await openTeam(page);
    await invite(page, { name: "Revoke Me", email });
    await dismissToasts(page);
    const actions = inviteRow(page, email).getByRole("button", { name: "Actions for Revoke Me" });

    await actions.click();
    await page.getByRole("dialog", { name: "Revoke Me" }).getByRole("button", { name: `Revoke invitation for ${email}` }).click();
    const confirm = page.getByRole("dialog", { name: "Revoke this invitation?" });
    await expect(confirm).toContainText(email);
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await expectNoA11yViolations(page);
    }
    await expectTapTargets(page);
    await confirm.getByRole("button", { name: "Keep it" }).click();
    await expect(confirm).toBeHidden();
    await expect(actions).toBeFocused();

    await actions.click();
    await page.getByRole("dialog", { name: "Revoke Me" }).getByRole("button", { name: `Revoke invitation for ${email}` }).click();
    await confirm.getByRole("button", { name: "Revoke invitation" }).click();

    await expect(page.getByRole("status").filter({ hasText: `Invitation for ${email} revoked` })).toBeVisible();
    await expect(inviteRow(page, email)).toHaveCount(0);
  });
});
