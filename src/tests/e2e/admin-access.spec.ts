// S-021 (customer sessions kept out of /admin) and S-022 (Owner-only screens), end to
// end through the real @supabase/ssr adapter and the local GoTrue stub.
import {
  expectKeyboardOperable,
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  expectNothingClipped,
  expectTapTargets,
  withZoom,
} from "./support/a11y";
import { addSessionCookies, signIn } from "./support/admin";
import { E2E_ACCOUNTS, createOrder } from "./support/database";
import { expect, test } from "./support/fixtures";

const ADMIN_PAGES = ["/admin", "/admin/orders?tab=review", "/admin/orders/00000000-0000-4000-8000-000000000000", "/admin/anything"];

test.describe("S-021 a customer session never opens admin pages", () => {
  test("AC1: every admin page redirects to the login page with no admin data, and the customer session stays", async ({ context, baseURL }) => {
    const names = await addSessionCookies(context, baseURL!, E2E_ACCOUNTS.customer);
    const before = (await context.cookies()).filter((c) => names.includes(c.name));

    for (const path of ADMIN_PAGES) {
      const response = await context.request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(302);
      expect(response.headers().location).toBe(`/admin/login?next=${encodeURIComponent(path)}`);
      expect(response.headers()["set-cookie"]).toBeUndefined();
      expect(await response.text()).toBe("");
    }
    const data = await context.request.get("/admin/orders.data?tab=review", { maxRedirects: 0 });
    const body = await data.text();
    expect(body).not.toContain(E2E_ACCOUNTS.owner.name);
    expect(body).not.toContain("APB-");

    expect((await context.cookies()).filter((c) => names.includes(c.name))).toEqual(before);
  });

  test("AC1, AC4: in the browser the customer lands on the public sign-in page", async ({ page, context, baseURL }) => {
    await addSessionCookies(context, baseURL!, E2E_ACCOUNTS.customer);
    await page.goto("/admin/orders");
    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Forders$/);
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
  });

  test("AC3: an admin action posted with a customer session is FORBIDDEN 403", async ({ context, baseURL, db }) => {
    await addSessionCookies(context, baseURL!, E2E_ACCOUNTS.customer);
    const order = await createOrder(db, "S-021 customer");
    const response = await context.request.post(`/admin/orders/${order.id}.data`, {
      form: { intent: "approve", version: "1" },
      headers: { Origin: baseURL! },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(403);
    expect(await response.text()).toContain("FORBIDDEN");
    expect(await db`select status, version from orders where id = ${order.id}`).toEqual([{ status: "pending_approval", version: 1 }]);
  });
});

const OWNER_PAGES = ["/admin/team", "/admin/settings", "/admin/availability"];

test.describe("S-022 Owner-only screens refuse Admins", () => {
  test("AC1: an Admin gets 403 with the Owner only state, a back link and no Owner data", async ({ page }) => {
    await signIn(page, E2E_ACCOUNTS.helper, "/admin");
    for (const path of OWNER_PAGES) {
      const response = await page.goto(path);
      expect(response!.status(), path).toBe(403);
      await expect(page.getByRole("heading", { level: 1, name: "Owner only" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Back to Today" })).toHaveAttribute("href", "/admin");
      await expect(page.getByRole("heading", { name: "Not available yet" })).toHaveCount(0);
    }
    await page.getByRole("link", { name: "Back to Today" }).click();
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("AC2: an Admin posting invite, saveRules or settings save directly gets FORBIDDEN 403", async ({ page, baseURL }) => {
    await signIn(page, E2E_ACCOUNTS.helper, "/admin");
    for (const [path, intent] of [["/admin/team", "invite"], ["/admin/availability", "saveRules"], ["/admin/settings", "save"]] as const) {
      const response = await page.request.post(path, { form: { intent, version: "1" }, headers: { Origin: baseURL! }, maxRedirects: 0 });
      expect(response.status(), path).toBe(403);
      expect(await response.text()).toContain("FORBIDDEN");
    }
  });

  test("AC3: an Owner opens the three pages", async ({ page }) => {
    await signIn(page, E2E_ACCOUNTS.owner, "/admin");
    // All three are built: Team (S-027), Settings (S-058) and Availability (S-056).
    const headings: Record<string, string> = { "/admin/team": "Team", "/admin/settings": "Settings", "/admin/availability": "Availability" };
    for (const path of OWNER_PAGES) {
      const response = await page.goto(path);
      expect(response!.status(), path).toBe(200);
      await expect(page.getByRole("heading", { level: 1, name: headings[path] })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Not available yet" })).toHaveCount(0);
    }
  });

  test("AC6: the Owner only page takes focus on its h1, works by keyboard, no clipping, 44 px targets at 100% and 200%", async ({ page }) => {
    await signIn(page, E2E_ACCOUNTS.helper, "/admin");
    await page.goto("/admin/team");
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
    await expect(page.getByRole("heading", { level: 1, name: "Owner only" })).toBeFocused();
    for (const zoom of [1, 2]) {
      await withZoom(page, zoom, async () => {
        await expectNoHorizontalScroll(page);
        await expectNothingClipped(page);
        await expectTapTargets(page);
        await expectKeyboardOperable(page);
      });
    }
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`AC7: axe clean in ${colorScheme} mode, in English and French`, async ({ page, context }) => {
      await page.emulateMedia({ colorScheme });
      await signIn(page, E2E_ACCOUNTS.helper, "/admin");
      await page.goto("/admin/settings");
      await expectNoA11yViolations(page);
      await expectNoA11yViolations(page, { zoom: 2 });

      await context.clearCookies();
      await signIn(page, E2E_ACCOUNTS.french, "/admin");
      await page.goto("/admin/settings");
      await expect(page.getByRole("heading", { level: 1, name: "Réservé aux propriétaires" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Retour à Aujourd'hui" })).toBeVisible();
      await expectNoA11yViolations(page);
    });
  }
});
