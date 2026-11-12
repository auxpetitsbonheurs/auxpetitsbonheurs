// E-02 Team: list (S-027), invite sheet (S-028), resend and revoke (S-030), change role
// (S-031), deactivate and reactivate (S-032), as the shared e2e Owner acting on throwaway
// admins (never on a shared account). Every spec invites its own unique address; Resend is not configured in e2e, so
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
import { createE2eAdmin, signIn } from "./support/admin";
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
    await expect(sheet.getByRole("button", { name: `Change role of ${E2E_ACCOUNTS.owner.name}` })).toBeVisible();
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

const personRow = (page: Page, name: string) => page.getByRole("region", { name: "People with access" }).getByRole("listitem").filter({ hasText: name });

async function openPerson(page: Page, name: string) {
  await personRow(page, name).getByRole("button", { name: `Actions for ${name}` }).click();
  const sheet = page.getByRole("dialog", { name });
  await expect(sheet).toBeVisible();
  return sheet;
}

/** The open dialog at 100% and 200%: focus trapped, nothing clipped, no sideways scroll, 44 px targets, axe light and dark. */
async function expectDialogAccessible(page: Page, dialog: ReturnType<Page["getByRole"]>) {
  for (let i = 0; i < 8; i += 1) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  for (const zoom of [1, 2]) {
    await withZoom(page, zoom, async () => {
      await expectNoHorizontalScroll(page);
      await expectNothingClipped(page);
      await expectTapTargets(page);
    });
  }
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await expectNoA11yViolations(page);
  }
}

const shortName = (prefix: string) => `${prefix} ${randomUUID().slice(0, 6)}`;

test.describe("S-031 change role", () => {
  test("AC1, AC8, AC9, AC10: promoting applies at once; making an Admin asks first, naming the person and the loss", async ({ page, db, browser }) => {
    test.slow();
    const name = shortName("Rolf");
    const helper = await createE2eAdmin(db, { name });
    await openTeam(page);

    let sheet = await openPerson(page, name);
    await expect(sheet).toContainText("Admin · Active");
    await sheet.getByRole("radio", { name: /^Owner/ }).check();
    await sheet.getByRole("button", { name: `Change role of ${name}` }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByRole("status").filter({ hasText: `${name} is now Owner` })).toBeVisible();
    await expect(personRow(page, name)).toContainText("Owner");

    // AC1: their very next request to an Owner page is allowed.
    const theirs = await browser.newContext();
    const theirPage = await theirs.newPage();
    await signIn(theirPage, helper, "/admin/team");
    await expect(theirPage.getByRole("heading", { level: 1, name: "Team" })).toBeVisible();
    await theirs.close();

    await dismissToasts(page);
    sheet = await openPerson(page, name);
    await sheet.getByRole("radio", { name: /^Admin/ }).check();
    await sheet.getByRole("button", { name: `Change role of ${name}` }).click();
    const confirm = page.getByRole("dialog", { name: `Make ${name} an Admin?` });
    await expect(confirm).toContainText(`${name} will lose access to Settings, Availability and Team.`);
    await expect(confirm.getByRole("heading", { name: `Make ${name} an Admin?` })).toBeFocused();
    await expectDialogAccessible(page, confirm);

    await confirm.getByRole("button", { name: "Make Admin" }).click();
    await expect(confirm).toBeHidden();
    await expect(page.getByRole("status").filter({ hasText: `${name} is now Admin` })).toBeVisible();
    await expect(personRow(page, name)).toContainText("Admin");
    await expect(personRow(page, name).getByRole("button", { name: `Actions for ${name}` })).toBeFocused();
  });

  test("AC9: the role sheet at 100% and 200%: keyboard only, nothing clipped, 44 px targets, axe light and dark", async ({ page, db }) => {
    const name = shortName("Sheet");
    await createE2eAdmin(db, { name });
    await openTeam(page);

    const sheet = await openPerson(page, name);
    await expectDialogAccessible(page, sheet);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(personRow(page, name).getByRole("button", { name: `Actions for ${name}` })).toBeFocused();
  });
});

test.describe("S-032 deactivate and reactivate", () => {
  test("AC1, AC2, AC6, AC10, AC11: deactivating asks first; their open tab is refused at once; reactivated, they sign in again", async ({ page, db, browser }) => {
    test.slow();
    const name = shortName("Dana");
    const helper = await createE2eAdmin(db, { name });
    // The helper's phone, signed in before the deactivation.
    const phone = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const phonePage = await phone.newPage();
    await signIn(phonePage, helper, "/admin/menu");
    await hydrated(phonePage);
    // A second tab of theirs, for an action posted after the deactivation.
    const tab = await browser.newContext();
    const tabPage = await tab.newPage();
    await signIn(tabPage, helper, "/admin/profile");

    await openTeam(page);
    const sheet = await openPerson(page, name);
    await sheet.getByRole("button", { name: `Deactivate ${name}` }).click();
    const confirm = page.getByRole("dialog", { name: `Deactivate ${name}?` });
    await expect(confirm).toContainText("signed out on every device at once");
    await expectDialogAccessible(page, confirm);
    await confirm.getByRole("button", { name: "Deactivate", exact: true }).click();
    await expect(confirm).toBeHidden();
    await expect(page.getByRole("status").filter({ hasText: `${name} is deactivated and signed out` })).toBeVisible();
    await expect(personRow(page, name)).toContainText("Deactivated");
    expect((await db`select active, deactivated_at is not null as stamped from admin where id = ${helper.id}`)[0]).toEqual({ active: false, stamped: true });

    // AC2: the phone's very next page request lands on sign-in.
    await phonePage.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: /^Orders/ }).click();
    await expect(phonePage).toHaveURL(/\/admin\/login/);
    // AC2: an action from the other tab gets 401 and no data.
    const posted = await tabPage.request.post("/admin/profile", {
      form: { intent: "updateProfile", name: "Still here", locale: "en" },
      headers: { origin: new URL(tabPage.url()).origin },
      maxRedirects: 0,
    });
    expect(posted.status()).toBe(401);
    expect((await db`select name from admin where id = ${helper.id}`)[0]!.name).toBe(name);
    // AC7 (generic refusal) while deactivated.
    await phonePage.getByRole("textbox", { name: "Email" }).fill(helper.email);
    await phonePage.getByLabel(/^Password/).fill(helper.password);
    await phonePage.getByRole("button", { name: "Sign in" }).click();
    await expect(phonePage.getByText("Email or password is not right")).toBeVisible();

    await dismissToasts(page);
    const again = await openPerson(page, name);
    await expect(again).toContainText("Admin · Deactivated");
    await again.getByRole("button", { name: `Reactivate ${name}` }).click();
    await expect(again).toBeHidden();
    await expect(page.getByRole("status").filter({ hasText: `${name} is active again` })).toBeVisible();
    await expect(personRow(page, name)).toContainText("Active");

    // AC6: they sign in again with their unchanged password; the old tab must sign in too.
    await signIn(phonePage, helper, "/admin");
    await expect(phonePage.getByRole("navigation", { name: "Admin" })).toBeVisible();
    await tabPage.goto("/admin/profile");
    await expect(tabPage).toHaveURL(/\/admin\/login/);
    await phone.close();
    await tab.close();
  });
});
