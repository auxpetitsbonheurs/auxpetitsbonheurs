// S-029 accept an invitation, end to end: the invitation row is written with a known token
// (its SHA-256 stored, as the app does), the page creates the account through the GoTrue
// stub's Admin API and signs the helper in. Each spec makes its own invitation.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type postgres from "postgres";
import {
  expectKeyboardOperable,
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  expectNothingClipped,
  expectTapTargets,
  withZoom,
} from "./support/a11y";
import { E2E_ACCOUNTS } from "./support/database";
import { type Page, expect, test } from "./support/fixtures";

const INVALID = "This invitation has expired or was already used. Ask the owner for a new one.";

async function createInvitation(db: postgres.Sql, options: { locale?: "en" | "fr"; role?: "admin" | "owner"; expired?: boolean } = {}) {
  const token = randomBytes(32).toString("base64url");
  const email = `invitee-${randomUUID().slice(0, 8)}@e2e.test`;
  const hash = createHash("sha256").update(token).digest("hex");
  const expires = options.expired ? "now() - interval '1 minute'" : "now() + interval '7 days'";
  await db.unsafe(
    `insert into admin_invitation (email, name, role, locale, token_hash, invited_by, expires_at) values ($1, 'Invited Helper', $2, $3, $4, $5, ${expires})`,
    [email, options.role ?? "admin", options.locale ?? "en", hash, E2E_ACCOUNTS.owner.id],
  );
  return { token, email };
}

async function open(page: Page, token: string) {
  await page.goto(`/admin/invite/${token}`);
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
}

test.describe("S-029 accept an invitation", () => {
  test("AC1, AC2: details read-only, a password, and the helper lands on Today signed in", async ({ page, db }) => {
    const invitation = await createInvitation(db);
    await open(page, invitation.token);

    await expect(page.getByRole("heading", { level: 1, name: "Join the bakery team" })).toBeFocused();
    await expect(page.getByText(invitation.email)).toBeVisible();
    await expect(page.getByText("Invited Helper")).toBeVisible();
    await page.getByLabel("Choose a password", { exact: true }).fill("a long new password");
    await page.getByRole("button", { name: "Create my account" }).click();

    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("navigation", { name: "Admin" })).toBeVisible();
    const [row] = await db`select role, active from admin where email = ${invitation.email}`;
    expect(row).toEqual({ role: "admin", active: true });

    // AC3: the same link again is no longer valid.
    await open(page, invitation.token);
    await expect(page.getByRole("alert")).toContainText(INVALID);
  });

  test("AC3, AC7: an expired or malformed link shows the calm message with HTTP 410", async ({ page, db }) => {
    const expired = await createInvitation(db, { expired: true });

    for (const token of [expired.token, "not-a-token"]) {
      const response = await page.goto(`/admin/invite/${token}`);
      expect(response?.status()).toBe(410);
      expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
      await expect(page.getByRole("heading", { level: 1, name: "This invitation cannot be used" })).toBeVisible();
      await expect(page.getByRole("alert")).toContainText(INVALID);
    }
  });

  test("AC4, AC9: a short password is a linked field error with the summary focused; the field and toggle are labelled", async ({ page, db }) => {
    const invitation = await createInvitation(db);
    await open(page, invitation.token);
    const password = page.getByLabel("Choose a password", { exact: true });
    await expect(password).toHaveAttribute("autocomplete", "new-password");
    await expect(page.getByRole("button", { name: "Show password" })).toBeVisible();

    await password.fill("123456789");
    await page.getByRole("button", { name: "Create my account" }).click();

    const summary = page.getByRole("alert");
    await expect(summary).toBeFocused();
    await summary.getByRole("link", { name: "At least 10 characters" }).click();
    await expect(password).toBeFocused();
    await expect(password).toHaveAttribute("aria-invalid", "true");
    expect((await db`select count(*)::int as n from admin where email = ${invitation.email}`)[0]!.n).toBe(0);
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await expectNoA11yViolations(page);
    }
  });

  test("AC8: keyboard, visible focus, no clipping or sideways scroll and 44 px targets at 100% and 200%", async ({ page, db }) => {
    const invitation = await createInvitation(db);
    await open(page, invitation.token);
    for (const zoom of [1, 2]) {
      await withZoom(page, zoom, async () => {
        await expectNoHorizontalScroll(page);
        await expectNothingClipped(page);
        await expectTapTargets(page);
        await expectKeyboardOperable(page);
      });
    }
  });

  test("AC10: a French invitation opens in French", async ({ page, db }) => {
    const invitation = await createInvitation(db, { locale: "fr", role: "owner" });
    await open(page, invitation.token);

    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByRole("heading", { level: 1, name: "Rejoindre l'équipe de la pâtisserie" })).toBeVisible();
    await expect(page.getByText("Propriétaire")).toBeVisible();
    await expect(page.getByRole("radio", { name: "Français" })).toBeChecked();
  });
});
