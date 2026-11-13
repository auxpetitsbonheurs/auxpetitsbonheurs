// E-11 S-212: signed-in checkout is prefilled, never gated, and the order lands in My orders even
// with another email typed (coordinator decision 2026-11-13). Guest checkout is covered by
// checkout.spec.ts and skeleton-order.spec.ts.
import { chooseDate } from "./support/checkout-date";
import { setClock } from "./support/clock";
import { createE2eCustomer, signInCustomer } from "./support/customer";
import { SAMPLE_PRODUCT } from "./support/database";
import { expectKeyboardOperable, expectNoA11yViolations, expectNoHorizontalScroll, expectTapTargets } from "./support/a11y";
import { expect, test } from "./support/fixtures";

const TOKEN_URL = /\/order\/([A-Za-z0-9_-]{43})\/confirmed$/;

test.describe("S-212 checkout for a signed-in customer", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await setClock(context, baseURL!, "2026-11-20T06:00:00Z");
  });

  test("AC1, AC5, AC6, AC9: details prefilled and editable; another email still lands in My orders", async ({ page, db }) => {
    const customer = await createE2eCustomer(db, "Signed Customer");
    await signInCustomer(page, customer);
    await page.goto(`/menu/${SAMPLE_PRODUCT.slug}`);
    await page.getByRole("button", { name: "Add to basket" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Added to your basket" }).or(page.getByRole("heading", { level: 1, name: "Your basket" }))).toBeVisible();
    await page.goto("/basket");
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");

    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Signed Customer");
    await expect(page.getByLabel("Phone", { exact: true })).toHaveValue("+23057123456");
    await expect(page.getByLabel("Email", { exact: true })).toHaveValue(customer.email);
    await expectNoHorizontalScroll(page);
    await expectTapTargets(page);
    await expectKeyboardOperable(page);
    await expectNoA11yViolations(page);

    await page.getByRole("radio", { name: /^Pickup/ }).check();
    await chooseDate(page, "2026-11-24");
    await page.getByRole("radio", { name: /^Morning/ }).locator("visible=true").check();
    await page.getByLabel("Email", { exact: true }).fill(`other-${Date.now()}@e2e.test`);
    await page.getByRole("checkbox", { name: "I accept the order policies" }).check();
    await page.getByRole("button", { name: "Place order" }).click();
    await expect(page).toHaveURL(TOKEN_URL);
    const token = TOKEN_URL.exec(page.url())![1]!;
    // Signed in: no "Save my details" card (S-215 AC1).
    await expect(page.getByRole("heading", { name: "Save your details for next time" })).toHaveCount(0);

    const [order] = await db<{ by_account: boolean; customer_id: string }[]>`select by_account, customer_id from orders where tracking_token = ${token}`;
    expect(order).toEqual({ by_account: true, customer_id: customer.customerId });
    await page.goto("/account/orders");
    await expect(page.locator(`a[href="/t/${token}"]`)).toBeVisible();
    // The profile is unchanged by what was typed for this order (AC5).
    await page.goto("/account");
    await expect(page.getByText(customer.email)).toBeVisible();
  });

  test("AC2, AC8: the default saved address is preselected in a labelled radio group; the order uses it", async ({ page, db }) => {
    const customer = await createE2eCustomer(db, "Address Customer");
    await db`insert into customer_address (customer_id, label, address, landmark, is_default) values (${customer.customerId}, 'Home', '7 Saved Avenue, Curepipe', 'Green door', true)`;
    await signInCustomer(page, customer);
    await page.goto(`/menu/${SAMPLE_PRODUCT.slug}`);
    await page.getByRole("button", { name: "Add to basket" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Added to your basket" }).or(page.getByRole("heading", { level: 1, name: "Your basket" }))).toBeVisible();
    await page.goto("/basket");
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
    await page.getByRole("radio", { name: /^Delivery/ }).check();
    const group = page.getByRole("group", { name: "Your saved addresses" });
    await expect(group.getByRole("radio", { name: /^Home/ })).toBeChecked();
    await expect(page.getByLabel("Delivery address")).toBeHidden();
    await group.getByRole("radio", { name: /^Home/ }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(group.getByRole("radio", { name: "A new address" })).toBeChecked();
    await expect(page.getByLabel("Delivery address")).toBeVisible();
    await page.keyboard.press("ArrowUp");
    await chooseDate(page, "2026-11-24");
    await page.getByRole("radio", { name: /^Morning/ }).locator("visible=true").check();
    await page.getByRole("checkbox", { name: "I accept the order policies" }).check();
    await page.getByRole("button", { name: /^Place order/ }).click();
    await expect(page).toHaveURL(TOKEN_URL);
    const token = TOKEN_URL.exec(page.url())![1]!;
    const [order] = await db<{ address: string; landmark: string }[]>`select address, landmark from orders where tracking_token = ${token}`;
    expect(order).toEqual({ address: "7 Saved Avenue, Curepipe", landmark: "Green door" });
  });
});

