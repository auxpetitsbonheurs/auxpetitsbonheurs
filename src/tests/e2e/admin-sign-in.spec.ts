// S-009 admin sign-in, end to end through the real @supabase/ssr adapter and the local
// GoTrue stub (no Supabase, no network).
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

const GENERIC = "Email or password is not right. Try again or reset your password.";

async function submit(page: Page, email: string, password: string) {
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.describe("S-009 admin sign-in", () => {
  test("AC1: valid credentials land on next with HttpOnly, Secure, SameSite=Lax session cookies", async ({ page, context }) => {
    await signIn(page, E2E_ACCOUNTS.owner, "/admin");

    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { level: 1, name: `Hello, ${E2E_ACCOUNTS.owner.name}` })).toBeVisible();
    const session = (await context.cookies()).filter((c) => /^sb-.+-auth-token/.test(c.name));
    expect(session.length).toBeGreaterThan(0);
    for (const cookie of session) expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "Lax" });
  });

  test("AC2: wrong password, unknown email, deactivated admin and customer account all show the same message", async ({ page }) => {
    const cases = [
      [E2E_ACCOUNTS.owner.email, "not the password"],
      ["nobody@e2e.test", E2E_ACCOUNTS.owner.password],
      [E2E_ACCOUNTS.deactivated.email, E2E_ACCOUNTS.deactivated.password],
      [E2E_ACCOUNTS.customer.email, E2E_ACCOUNTS.customer.password],
    ];
    for (const [email, password] of cases) {
      await page.goto("/admin/login");
      const response = page.waitForResponse((r) => r.request().method() === "POST");
      await submit(page, email!, password!);
      expect((await response).status()).toBe(401);
      await expect(page.getByRole("alert")).toHaveText(GENERIC);
      await expect(page).toHaveURL(/\/admin\/login/);
    }
    expect((await page.context().cookies()).filter((c) => c.name.startsWith("sb-"))).toEqual([]);
  });

  test("AC4: signed out, /admin and /admin/* redirect to the login page with next and no admin data", async ({ page, request }) => {
    for (const path of ["/admin", "/admin/anything"]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status()).toBe(302);
      expect(response.headers().location).toBe(`/admin/login?next=${encodeURIComponent(path)}`);
      expect(await response.text()).toBe("");
    }
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin$/);
  });

  test("AC4: a signed-in customer is sent to the admin login page", async ({ page }) => {
    await page.goto("/admin/login");
    await submit(page, E2E_ACCOUNTS.customer.email, E2E_ACCOUNTS.customer.password);
    await expect(page.getByRole("alert")).toHaveText(GENERIC);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("AC5: empty or invalid fields each show an error; the summary takes focus and links to them", async ({ page }) => {
    await page.goto("/admin/login");
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
    await page.getByRole("button", { name: "Sign in" }).click();

    const summary = page.getByRole("alert");
    await expect(summary).toBeFocused();
    await expect(summary.getByRole("link", { name: "Enter your email address." })).toHaveAttribute("href", "#email");
    await expect(summary.getByRole("link", { name: "Enter your password." })).toHaveAttribute("href", "#password");
    await expect(page.getByLabel("Email", { exact: true })).toHaveAttribute("aria-invalid", "true");

    await page.getByLabel("Email", { exact: true }).fill("sarah@");
    await page.getByLabel("Password", { exact: true }).fill("x");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert").getByRole("link", { name: "Enter an email address, for example name@example.com." })).toBeVisible();
    await page.getByRole("alert").getByRole("link").first().click();
    await expect(page.getByLabel("Email", { exact: true })).toBeFocused();
  });

  test("AC6: an absolute or protocol-relative next lands on /admin", async ({ page }) => {
    for (const next of ["https://evil.example", "//evil.example"]) {
      await page.context().clearCookies();
      await signIn(page, E2E_ACCOUNTS.owner, next);
      await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/admin$/);
    }
  });

  test("AC7: Sign out clears the cookies, lands on login, and Back shows no admin data", async ({ page }) => {
    const response = await page.goto("/admin/login");
    expect(response!.headers()["cache-control"]).toBe("private, no-store");
    expect(response!.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    await signIn(page, E2E_ACCOUNTS.owner, "/admin");
    const adminPage = await page.reload();
    expect(adminPage!.headers()["cache-control"]).toBe("private, no-store");

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);
    expect((await page.context().cookies()).filter((c) => c.name.startsWith("sb-"))).toEqual([]);

    await page.goBack();
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.getByText(E2E_ACCOUNTS.owner.name)).toHaveCount(0);
  });

  test("AC8: an admin POST from another origin is refused with 403", async ({ request }) => {
    for (const path of ["/admin/login", "/admin/sign-out"]) {
      const response = await request.post(path, {
        form: { email: E2E_ACCOUNTS.owner.email, password: E2E_ACCOUNTS.owner.password },
        headers: { Origin: "https://evil.example" },
        maxRedirects: 0,
      });
      expect(response.status()).toBe(403);
      expect(response.headers()["set-cookie"]).toBeUndefined();
    }
  });

  test("AC9: keyboard order, visible focus, no clipping or sideways scroll, 44 px targets at 100% and 200%", async ({ page }) => {
    await page.goto("/admin/login");
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
    for (const zoom of [1, 2]) {
      await withZoom(page, zoom, async () => {
        await expectNoHorizontalScroll(page);
        await expectNothingClipped(page);
        await expectTapTargets(page);
        await expectKeyboardOperable(page);
      });
    }
  });

  test("AC10: labelled fields with autocomplete, a named show-password toggle that announces, a labelled loading button", async ({ page }) => {
    await page.goto("/admin/login");
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
    await expect(page.getByLabel("Email", { exact: true })).toHaveAttribute("autocomplete", "username");
    const password = page.getByLabel("Password", { exact: true });
    await expect(password).toHaveAttribute("autocomplete", "current-password");
    await expect(password).toHaveAttribute("type", "password");

    await page.getByRole("button", { name: "Show password" }).click();
    await expect(password).toHaveAttribute("type", "text");
    await expect(page.getByRole("status").filter({ hasText: "Your password is visible." })).toBeAttached();
    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(password).toHaveAttribute("type", "password");
    await expect(page.getByRole("status").filter({ hasText: "Your password is hidden." })).toBeAttached();

    await page.getByLabel("Email", { exact: true }).fill(E2E_ACCOUNTS.owner.email);
    await password.fill(E2E_ACCOUNTS.owner.password);
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/admin/login*", async (route) => {
      if (route.request().method() === "POST") await held;
      await route.continue();
    });
    await page.getByRole("button", { name: "Sign in" }).click();
    const button = page.getByRole("button", { name: "Sign in" });
    await expect(button).toHaveAttribute("aria-busy", "true");
    await expect(page.getByRole("status").filter({ hasText: "Signing you in…" })).toBeAttached();
    release();
    await expect(page).toHaveURL(/\/admin$/);
  });

  test.describe("S-023 RL-auth", () => {
    async function exhaust(page: Page, email: string) {
      await page.goto("/admin/login");
      await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
      for (let i = 0; i < 5; i += 1) {
        const response = page.waitForResponse((r) => r.request().method() === "POST");
        await submit(page, email, `wrong-${i}`);
        expect((await response).status()).toBe(401);
        await expect(page.getByRole("alert")).toHaveText(GENERIC);
      }
      const limited = page.waitForResponse((r) => r.request().method() === "POST");
      await submit(page, email, "still wrong");
      return limited;
    }

    test("AC8: the sixth attempt says wait, is announced, keeps the fields, and passes keyboard, zoom, 44 px and axe checks", async ({ page }) => {
      const response = await exhaust(page, "limited@e2e.test");
      expect((await response).status()).toBe(429);
      expect((await response).headers()["retry-after"]).toMatch(/^\d+$/);

      const alert = page.getByRole("alert");
      await expect(alert).toContainText("Too many attempts, wait a few minutes.");
      await expect(alert).toContainText(/You can try again in \d+ minutes?\./);
      await expect(alert).toBeFocused();
      await expect(page.getByLabel("Email", { exact: true })).toHaveValue("limited@e2e.test");
      await expect(page.getByLabel("Password", { exact: true })).toHaveValue("still wrong");

      for (const zoom of [1, 2]) {
        await withZoom(page, zoom, async () => {
          await expectNoHorizontalScroll(page);
          await expectNothingClipped(page);
          await expectTapTargets(page);
          await expectKeyboardOperable(page);
        });
      }
      for (const colorScheme of ["light", "dark"] as const) {
        // Reduced motion: the colour change is instant, so axe never samples a half-way transition.
        await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
        await expectNoA11yViolations(page);
      }
    });

    test("AC3: the limit is per email and IP: the Owner on another connection still signs in", async ({ page, browser, baseURL }) => {
      expect((await exhaust(page, E2E_ACCOUNTS.owner.email)).status()).toBe(429);
      await expect(page.getByRole("alert")).toContainText("Too many attempts");

      const other = await browser.newContext({ baseURL, extraHTTPHeaders: { "cf-connecting-ip": "198.51.100.23" } });
      const otherPage = await other.newPage();
      await signIn(otherPage, E2E_ACCOUNTS.owner, "/admin");
      await expect(otherPage).toHaveURL(/\/admin$/);
      await other.close();
    });
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`AC11: axe clean in ${colorScheme} mode, empty and with errors`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto("/admin/login");
      await expectNoA11yViolations(page);
      await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page.getByRole("alert")).toBeVisible();
      await expectNoA11yViolations(page);
      await submit(page, E2E_ACCOUNTS.owner.email, "wrong");
      await expect(page.getByRole("alert")).toHaveText(GENERIC);
      await expectNoA11yViolations(page, { zoom: 2 });
    });
  }

  test("AC12: the login page follows the remembered French language, and a French admin's pages are French", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "apb_locale", value: "fr", url: baseURL! }]);
    await page.goto("/admin/login");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByRole("heading", { level: 1, name: "Connexion" })).toBeVisible();
    await page.getByLabel("E-mail", { exact: true }).fill(E2E_ACCOUNTS.owner.email);
    await page.getByLabel("Mot de passe", { exact: true }).fill("faux");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page.getByRole("alert")).toHaveText("L'e-mail ou le mot de passe n'est pas correct. Réessayez ou réinitialisez votre mot de passe.");

    await context.clearCookies();
    await signIn(page, E2E_ACCOUNTS.french, "/admin");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByRole("heading", { level: 1, name: `Bonjour, ${E2E_ACCOUNTS.french.name}` })).toBeVisible();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible();
  });
});
