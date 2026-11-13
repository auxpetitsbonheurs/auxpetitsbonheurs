// E-11 customer accounts end to end through the real @supabase/ssr adapter and the GoTrue stub
// (which records the signup and sign-in "emails"): S-206 sign-up, S-207 sign-in and sign-out,
// S-208 one-time link, S-209 reset, S-210 profile, S-213 My orders; layout, keyboard and axe
// at every viewport, EN and FR.
import {
  expectKeyboardOperable,
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  expectNothingClipped,
  expectTapTargets,
  withZoom,
} from "./support/a11y";
import { createE2eCustomer, createOrderFor, e2eEmail, emailedLink, signInCustomer } from "./support/customer";
import { type Page, expect, test } from "./support/fixtures";

const SCREENSHOTS = "/tmp/claude-0/-home-user-auxpetitsbonheurs/9106cb54-2393-55df-a3cb-bd8500903b6a/scratchpad";

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

test.describe("S-206 sign up, confirm, choose a password", () => {
  test("AC1, AC2, AC9 + S-216 AC1: earlier guest orders appear once the email is confirmed", async ({ page, db }, testInfo) => {
    const email = e2eEmail("signup");
    const earlier = await createOrderFor(db, email);
    await hydrated(page, "/account/sign-up");
    await expect(page.getByLabel("Password")).toHaveCount(0);
    await page.getByLabel("Your name").fill("Aisha Kowalski");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Phone").fill("5712 3456");
    if (testInfo.project.name === "phone-375") await page.screenshot({ path: `${SCREENSHOTS}/reviews-1-signup.png`, fullPage: true });
    await page.getByRole("button", { name: "Create account" }).click();

    const status = page.getByRole("status").filter({ hasText: "Check your email to confirm" });
    await expect(status).toBeVisible();
    await expect(status).toBeFocused();

    await page.goto(await emailedLink(email));
    await expect(page).toHaveURL(/\/account\/reset\?mode=new/);
    await expect(page.getByRole("heading", { level: 1, name: "Choose a password" })).toBeVisible();
    await page.getByLabel("New password").fill("a long enough password");
    await page.getByRole("button", { name: "Save password" }).click();

    await expect(page).toHaveURL(/\/account\/orders$/);
    await expect(page.getByRole("link", { name: `Track order APB-${String(earlier.number).padStart(4, "0")}` })).toBeVisible();
    await expect(page.locator('header a[aria-label="My account"]')).toBeAttached();
  });

  test("AC3: a 9-character password shows the hint and stays on the page; the step can be skipped", async ({ page }) => {
    const email = e2eEmail("short");
    await hydrated(page, "/account/sign-up");
    await page.getByLabel("Your name").fill("Short Pw");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Phone").fill("5712 3456");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Check your email" })).toBeVisible();
    await page.goto(await emailedLink(email));

    await page.getByLabel("New password").fill("123456789");
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page.getByText("Use at least 10 characters.").first()).toBeVisible();
    await page.getByRole("link", { name: "Skip for now" }).click();
    await expect(page).toHaveURL(/\/account\/orders$/);
    await expect(page.getByText("You have no orders yet.")).toBeVisible();
  });

  test("AC8, AC10, AC11: field errors, layout and axe in EN and FR", async ({ page }) => {
    await hydrated(page, "/account/sign-up");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Enter a phone number, e.g. 5712 3456").first()).toBeVisible();
    await expect(page.getByLabel("Phone")).toHaveAttribute("aria-describedby", /phone-error/);
    await checkLayout(page);
    await hydrated(page, "/fr/account/sign-up");
    await expect(page.getByRole("heading", { level: 1, name: "Créer un compte" })).toBeVisible();
    await checkLayout(page);
  });
});

test.describe("S-207 sign in and sign out", () => {
  test("AC1, AC5, AC6, AC9: a customer page sends to sign-in and back; sign out ends it", async ({ page, db }) => {
    const customer = await createE2eCustomer(db);
    await page.goto("/account/orders");
    await expect(page).toHaveURL(/\/account\/sign-in\?next=%2Faccount%2Forders$/);
    await expect(page.locator('header a[aria-label="Sign in"]')).toBeAttached();

    await signInCustomer(page, customer, "/account/orders");
    await expect(page).toHaveURL(/\/account\/orders$/);
    await expect(page.locator('header a[aria-label="My account"]')).toBeAttached();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('header a[aria-label="Sign in"]')).toBeAttached();
    await page.goBack();
    await expect(page).toHaveURL(/\/account\/sign-in/);
  });

  test("AC2: wrong password and unknown email read the same", async ({ page, db }) => {
    const customer = await createE2eCustomer(db);
    for (const email of [customer.email, "nobody@e2e.test"]) {
      await hydrated(page, "/account/sign-in");
      await page.getByLabel("Email", { exact: true }).fill(email);
      await page.getByLabel("Password", { exact: true }).fill("not the password");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page.getByRole("alert")).toContainText("Email or password is wrong.");
      await expect(page.getByRole("alert")).toBeFocused();
    }
  });

  test("AC8: a signed-in customer opening /admin goes to the admin login, with no admin data", async ({ page, db }) => {
    const customer = await createE2eCustomer(db);
    await signInCustomer(page, customer);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin$/);
  });

  test("AC11, AC12, AC13: layout, keyboard and axe in EN and FR", async ({ page }) => {
    await hydrated(page, "/account/sign-in");
    await checkLayout(page);
    await hydrated(page, "/fr/account/sign-in");
    await expect(page.getByRole("heading", { level: 1, name: "Se connecter" })).toBeVisible();
    await checkLayout(page);
  });
});

test.describe("S-208 one-time link", () => {
  test("AC1, AC3, AC7: the link tab answers generically, focuses the status, and the link signs in", async ({ page, db }) => {
    const customer = await createE2eCustomer(db);
    await hydrated(page, "/account/sign-in?next=%2Faccount%2Forders");
    await page.getByRole("link", { name: "Email me a link" }).click();
    await expect(page).toHaveURL(/method=link/);
    await expect(page.getByRole("link", { name: "Email me a link" })).toHaveAttribute("aria-current", "page");
    await page.getByLabel("Email", { exact: true }).fill(customer.email);
    await page.getByRole("button", { name: "Email me a link" }).click();
    const status = page.getByRole("status").filter({ hasText: "If this email can sign in, a link is on its way." });
    await expect(status).toBeFocused();

    await page.goto(await emailedLink(customer.email));
    await expect(page).toHaveURL(/\/account\/orders$/);
  });

  test("AC4: a used link lands on the expired notice", async ({ page }) => {
    await page.goto("/auth/confirm?token_hash=used0123&type=magiclink&next=%2Faccount");
    await expect(page.getByText("This link has expired or was already used")).toBeVisible();
    await checkLayout(page);
  });
});

test.describe("S-209 reset and S-210 profile", () => {
  test("S-209 AC1, AC7, AC8: the request answers generically; layout and axe", async ({ page }) => {
    await hydrated(page, "/account/reset");
    await page.getByLabel("Email", { exact: true }).fill("someone@e2e.test");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("status").filter({ hasText: "If this email has an account, a reset link is on its way." })).toBeFocused();
    await checkLayout(page);
  });

  test("S-210 AC1, AC4, AC7, AC8: edit name and phone, email read-only, Saved announced", async ({ page, db }) => {
    const customer = await createE2eCustomer(db);
    await signInCustomer(page, customer);
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByText(customer.email)).toBeVisible();
    await expect(page.getByLabel("Email")).toHaveCount(0);
    await page.getByLabel("Phone").fill("5799 1234");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Phone")).toHaveValue("+23057991234");
    await checkLayout(page);
  });
});

test.describe("S-215 Save my details and S-216 linking", () => {
  test("S-215 AC2, AC9 + S-216 AC1, AC4: one tap, check your email; after confirming, both earlier orders are in My orders", async ({ page, db }) => {
    const email = e2eEmail("save");
    const first = await createOrderFor(db, email);
    const second = await createOrderFor(db, email);
    await hydrated(page, `/account/save-details?t=${second.trackingToken}`);
    await expect(page.getByText(email)).toBeVisible();
    await page.getByRole("button", { name: "Save my details" }).click();
    const status = page.getByRole("status").filter({ hasText: "Check your email to confirm" });
    await expect(status).toBeFocused();
    await checkLayout(page);

    // Not confirmed yet: no account session, nothing to see (S-216 AC4).
    await page.goto("/account/orders");
    await expect(page).toHaveURL(/\/account\/sign-in/);

    await page.goto(await emailedLink(email));
    await page.getByRole("link", { name: "Skip for now" }).click();
    await expect(page).toHaveURL(/\/account\/orders$/);
    for (const order of [first, second]) {
      await expect(page.getByRole("link", { name: `Track order APB-${String(order.number).padStart(4, "0")}` })).toBeVisible();
    }
  });
});
