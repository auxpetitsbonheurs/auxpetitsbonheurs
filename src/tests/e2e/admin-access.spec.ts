// S-021 (customer sessions kept out of /admin) and S-022 (Owner-only screens), end to
// end through the real @supabase/ssr adapter and the local GoTrue stub.
import { addSessionCookies } from "./support/admin";
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
