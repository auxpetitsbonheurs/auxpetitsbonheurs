// S-219: journey J10 on a 375 px phone. A guest with two orders saves their details, confirms the
// email (the GoTrue stub stands in for the email), chooses a password, signs in, sees both orders
// and reorders; before confirming nothing is visible; a customer session never opens /admin;
// repeated wrong passwords get the wait message. Guest checkout itself is checkout.spec.ts and
// skeleton-order.spec.ts (AC3 is covered there in EN and FR).
import { expectNoHorizontalScroll, expectTapTargets } from "./support/a11y";
import { createOrderFor, e2eEmail, emailedLink } from "./support/customer";
import { SAMPLE_PRODUCT } from "./support/database";
import { expect, test } from "./support/fixtures";

test.describe("S-219 journey J10", () => {
  test.beforeEach(({ page }) => {
    test.skip(page.viewportSize()?.width !== 375, "the journey runs once, on the 375 px phone (AC7)");
  });

  test("AC1, AC2, AC4, AC5, AC7: save details, confirm, password, both orders, reorder, no admin", async ({ page, db }) => {
    const email = e2eEmail("j10");
    const first = await createOrderFor(db, email, { status: "completed" });
    const second = await createOrderFor(db, email);
    const [product] = await db<{ id: string; name_en: string }[]>`select id, name_en from product where slug = ${SAMPLE_PRODUCT.slug}`;
    await db`insert into order_item (order_id, product_id, name_en, name_fr, original_base_price_rs, unit_base_price_rs, options, quantity, line_total_rs, sort_order)
      select o.id, ${product!.id}, ${product!.name_en}, null, 850, 850, '[]', 1, 850, 0 from orders o where o.tracking_token = ${first.trackingToken}`;

    // Save my details (no password asked).
    await page.goto(`/account/save-details?t=${second.trackingToken}`);
    await page.getByRole("button", { name: "Save my details" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Check your email to confirm" })).toBeVisible();

    // AC5: before confirming, My orders shows nothing to anyone, and the tracking link still works.
    await page.goto("/account/orders");
    await expect(page).toHaveURL(/\/account\/sign-in/);
    const tracking = await page.goto(`/t/${second.trackingToken}`);
    expect(tracking?.status()).toBe(200);

    // Confirm, choose a password, then sign out and sign in with it.
    await page.goto(await emailedLink(email));
    await page.getByLabel("New password").fill("a good long password");
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page).toHaveURL(/\/account\/orders$/);
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.goto("/account/sign-in?next=%2Faccount%2Forders");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill("a good long password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    // AC1: both earlier orders.
    for (const order of [first, second]) {
      await expect(page.getByRole("link", { name: `Track order APB-${String(order.number).padStart(4, "0")}` })).toBeVisible();
    }
    await expectNoHorizontalScroll(page);
    await expectTapTargets(page);

    // AC2: reorder the past one; the basket has the item at today's price and a new date is chosen at checkout.
    await page.getByRole("button", { name: `Reorder order APB-${String(first.number).padStart(4, "0")}` }).click();
    await expect(page).toHaveURL(/\/basket$/);
    await expect(page.getByRole("group", { name: `Quantity of ${product!.name_en}` })).toBeVisible();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Guest");

    // AC4: a customer session never opens the admin app.
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin$/);
  });

  test("AC6: after repeated wrong passwords the 6th shows the wait message", async ({ page }) => {
    const email = e2eEmail("j10-limit");
    await page.goto("/account/sign-in");
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
    for (let attempt = 1; attempt <= 6; attempt++) {
      await page.getByLabel("Email", { exact: true }).fill(email);
      await page.getByLabel("Password", { exact: true }).fill("not the password");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page.getByRole("alert")).toBeVisible();
    }
    await expect(page.getByRole("alert")).toContainText(/Too many tries, wait \d+ min\./);
  });
});
