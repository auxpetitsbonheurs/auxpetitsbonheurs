// S-025 forgot password and S-026 reset, end to end through the real @supabase/ssr adapter
// and the local GoTrue stub (it records the recovery "email"; the hook's own link building
// is unit-tested in send-email.test.ts). Each spec that changes a password makes its own admin.
import {
  expectKeyboardOperable,
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  expectNothingClipped,
  expectTapTargets,
  withZoom,
} from "./support/a11y";
import { createE2eAdmin, recoveryFor } from "./support/admin";
import { type Page, expect, test } from "./support/fixtures";

const SENT = "If that email belongs to an admin, a reset link is on its way.";

async function hydrated(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
}

async function checkLayout(page: Page) {
  for (const zoom of [1, 2]) {
    await withZoom(page, zoom, async () => {
      await expectNoHorizontalScroll(page);
      await expectNothingClipped(page);
      await expectTapTargets(page);
      await expectKeyboardOperable(page);
    });
  }
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await expectNoA11yViolations(page);
  }
}

/** Asks for a link on the forgot page and returns the token the stub "emailed". */
async function requestLink(page: Page, email: string): Promise<string> {
  await hydrated(page, "/admin/forgot");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Send the link" }).click();
  await expect(page.getByRole("status").filter({ hasText: SENT })).toBeVisible();
  let sent: Awaited<ReturnType<typeof recoveryFor>> = null;
  await expect.poll(async () => (sent = await recoveryFor(email))).not.toBeNull();
  return sent!.tokenHash;
}

test.describe("S-025 forgot password", () => {
  test("AC1 + AC5: sign-in links to forgot and back; an admin's email gets a link to /admin/reset", async ({ page, db }) => {
    const admin = await createE2eAdmin(db);
    await hydrated(page, "/admin/login");
    await page.getByRole("link", { name: "Forgot your password?" }).click();
    await expect(page).toHaveURL(/\/admin\/forgot$/);
    await expect(page.getByRole("heading", { level: 1, name: "Reset your password" })).toBeVisible();

    await requestLink(page, admin.email);
    expect((await recoveryFor(admin.email))!.redirectTo).toMatch(/^http:\/\/localhost:\d+\/admin\/reset$/);

    await page.getByRole("link", { name: "Back to sign in" }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test("AC7: labelled email field with email keyboard, announced confirmation, axe clean", async ({ page }) => {
    await hydrated(page, "/admin/forgot");
    const email = page.getByLabel("Email", { exact: true });
    await expect(email).toHaveAttribute("autocomplete", "email");
    await expect(email).toHaveAttribute("type", "email");
    await expect(email).toHaveAttribute("inputmode", "email");
    await email.fill("nobody@e2e.test");
    await page.getByRole("button", { name: "Send the link" }).click();
    await expect(page.getByRole("status").filter({ hasText: SENT })).toBeVisible();
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await expectNoA11yViolations(page);
    }
  });

  test("AC6: keyboard, zoom, 44 px and no sideways scroll, also with a field error", async ({ page }) => {
    await hydrated(page, "/admin/forgot");
    await checkLayout(page);
    await page.getByRole("button", { name: "Send the link" }).click();
    await expect(page.getByRole("alert")).toBeFocused();
    await expect(page.getByRole("alert").getByRole("link", { name: "Enter your email address." })).toBeVisible();
    await checkLayout(page);
  });
});

test.describe("S-026 set a new password", () => {
  test("AC2: from the link to Today, signed in; the old password no longer works and the link is spent", async ({ page, db }) => {
    const admin = await createE2eAdmin(db, { name: "Reset Tester" });
    const token = await requestLink(page, admin.email);

    await page.goto(`/auth/confirm?token_hash=${token}&type=recovery&next=/admin/reset`);
    await expect(page).toHaveURL(/\/admin\/reset$/);
    await expect(page.getByRole("heading", { level: 1, name: "Choose a new password" })).toBeVisible();
    await expect(page.getByText(admin.email)).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");

    await page.getByLabel("New password", { exact: true }).fill("a brand new password");
    await page.getByRole("button", { name: "Save and sign in" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { level: 1, name: "Hello, Reset Tester" })).toBeVisible();

    // The same link again: expired, with a way to ask for a new one (AC4).
    await page.goto(`/auth/confirm?token_hash=${token}&type=recovery&next=/admin/reset`);
    await expect(page.getByRole("heading", { level: 1, name: "This link has expired" })).toBeVisible();
    await page.getByRole("link", { name: "Request a new link" }).click();
    await expect(page).toHaveURL(/\/admin\/forgot$/);
  });

  test("AC4: /admin/reset without a recovery session is 410 with the expired message", async ({ page }) => {
    const response = await page.goto("/admin/reset");
    expect(response!.status()).toBe(410);
    await expect(page.getByText("This link has expired. Request a new one.")).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test("AC6: an absolute next is ignored", async ({ page, db }) => {
    const admin = await createE2eAdmin(db);
    const token = await requestLink(page, admin.email);
    await page.goto(`/auth/confirm?token_hash=${token}&type=recovery&next=${encodeURIComponent("https://evil.example/")}`);
    await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/admin\/reset$/);
  });

  test("AC3 + AC8 + AC9: rule, toggle, linked error, keyboard, zoom and axe", async ({ page, db }) => {
    const admin = await createE2eAdmin(db);
    const token = await requestLink(page, admin.email);
    await page.goto(`/auth/confirm?token_hash=${token}&type=recovery&next=/admin/reset`);
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");

    const password = page.getByLabel("New password", { exact: true });
    await expect(password).toHaveAttribute("autocomplete", "new-password");
    await expect(password).toHaveAccessibleDescription("At least 10 characters");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(password).toHaveAttribute("type", "text");
    await expect(page.getByRole("status").filter({ hasText: "Your password is visible." })).toBeAttached();
    await page.getByRole("button", { name: "Hide password" }).click();
    await checkLayout(page);

    await password.fill("123456789");
    await page.getByRole("button", { name: "Save and sign in" }).click();
    await expect(page.getByRole("alert")).toBeFocused();
    await expect(password).toHaveAttribute("aria-invalid", "true");
    await expect(password).toHaveAccessibleDescription(/At least 10 characters.*At least 10 characters/);
    await checkLayout(page);
  });
});
