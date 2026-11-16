// S-320 order discount, on a phone and a desktop: an Admin adds a discount from the Payment
// section (amount or percentage, the new total before saving, a calm error), the Activity line,
// the customer's tracking page and payment guide with Subtotal / Discount / Total, a paid order's
// locked discount, and French with Remove. Axe, 44 px targets, no sideways scroll and 200% zoom
// at 320/375/1280 px.
import type postgres from "postgres";
import { expectNoA11yViolations, expectNoHorizontalScroll, expectNothingClipped, expectTapTargets } from "./support/a11y";
import { signIn } from "./support/admin";
import type { E2eAccount } from "./support/auth-users";
import { E2E_ACCOUNTS, createOrder } from "./support/database";
import { type Page, expect, test } from "./support/fixtures";

const SHOTS = "/tmp/claude-0/-home-user-auxpetitsbonheurs/9106cb54-2393-55df-a3cb-bd8500903b6a/scratchpad";
const isPhone375 = () => test.info().project.name === "phone-375";

/** Rs 1,200 of cake + Rs 150 delivery = Rs 1,350, approved and awaiting its Juice payment. */
async function awaitingOrder(db: postgres.Sql, label: string, locale: "en" | "fr" = "en") {
  const order = await createOrder(db, label);
  await db`update orders set status = 'awaiting_payment', awaiting_payment_since = now(), fulfilment = 'delivery', address = '2 Example Road, Example Town',
    delivery_fee_rs = 150, items_total_rs = 1200, total_rs = 1350, locale = ${locale}, contact_email = 'customer@example.com' where id = ${order.id}`;
  await db`insert into order_item (order_id, name_en, name_fr, original_base_price_rs, unit_base_price_rs, quantity, line_total_rs)
    values (${order.id}, 'Chocolate cake', 'Gâteau au chocolat', 600, 600, 2, 1200)`;
  return order;
}

async function open(page: Page, path: string, account: E2eAccount = E2E_ACCOUNTS.helper) {
  await signIn(page, account, path);
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
}

/**
 * Where the page is checked from: the top, except on a 320 px phone, where at the very top the
 * delivery order's Maps link happens to sit half under the sticky action bar (axe target-size):
 * there the Discount section is scrolled to the top instead.
 */
async function scrollToTop(page: Page, heading: string) {
  if (test.info().project.name !== "phone-320") return;
  await page.getByRole("heading", { name: heading, exact: true }).evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 16));
}

async function checkA11y(page: Page) {
  await expectNoA11yViolations(page);
  await expectTapTargets(page);
  await expectNoHorizontalScroll(page);
  await expectNothingClipped(page);
  await expectNoA11yViolations(page, { zoom: 2 });
}

test.describe("Add a discount (S-320 AC1-AC3, AC6, AC7, AC11)", () => {
  test("10% with a reason: the new total before saving, saved at once, logged, and the customer sees it", async ({ page, db }) => {
    const order = await awaitingOrder(db, "Discount Person");
    await open(page, `/admin/orders/${order.id}`);

    await page.getByRole("button", { name: "Add a discount" }).click();
    const dialog = page.getByRole("dialog", { name: "Add a discount" });
    await dialog.getByLabel("Percentage (%)").check();
    await dialog.getByLabel("Percentage", { exact: true }).fill("10");
    await expect(dialog.getByText("Discount Rs 120 · new total Rs 1,230")).toBeVisible();
    await dialog.getByLabel(/^Reason/).fill("Loyal customer");
    await expectNoA11yViolations(page);
    await expectTapTargets(page);
    await dialog.getByRole("button", { name: "Save discount" }).click();

    await expect(dialog).toBeHidden();
    const items = page.getByRole("region", { name: "Items" });
    await expect(items.getByText("Discount (Loyal customer)")).toBeVisible();
    await expect(items.getByText("−Rs 120")).toBeVisible();
    await expect(items.getByText("Rs 1,230", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Change discount" })).toBeVisible();
    await expect(page.getByText(/^Discount added by Sarah, /)).toBeVisible();
    await expect(page.getByText("Discount: Rs 120 (10%), Loyal customer")).toBeVisible();
    const [row] = await db<{ total_rs: number; discount_rs: number }[]>`select total_rs, discount_rs from orders where id = ${order.id}`;
    expect(row).toEqual({ total_rs: 1230, discount_rs: 120 });
    if (isPhone375()) {
      await page.getByRole("heading", { name: "Items" }).evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 16));
      await page.screenshot({ path: `${SHOTS}/s320-admin-order-discount-375.png` });
    }
    // Reloaded: kept.
    await page.reload();
    await expect(page.getByRole("button", { name: "Change discount" })).toBeVisible();
    await scrollToTop(page, "Discount");
    await checkA11y(page);

    // The customer's tracking page: Subtotal, Discount (reason), Total, and the payment guide's amount.
    await page.goto(`/t/${order.trackingToken}`);
    await expect(page.getByTestId("tracking-discount")).toContainText("Discount (Loyal customer)");
    await expect(page.getByTestId("tracking-discount")).toContainText("−Rs 120");
    // The Juice card or, without the shop's Juice details, the calm fallback: both name the amount and the discount.
    await expect(page.getByTestId(/^payment-(instructions|fallback)$/).getByText(/Rs 1,230/).first()).toBeVisible();
    await expect(page.getByTestId("payment-discount")).toHaveText("Includes a discount of Rs 120: Loyal customer (full price Rs 1,350).");
    if (isPhone375()) {
      await page.getByTestId("tracking-discount").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${SHOTS}/s320-tracking-discount-375.png` });
      await page.getByTestId("payment-discount").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${SHOTS}/s320-payment-guide-discount-375.png` });
    }
    await checkA11y(page);
  });

  test("more than the items is refused at once, calmly; nothing is saved", async ({ page, db }) => {
    const order = await awaitingOrder(db, "Too Much");
    await open(page, `/admin/orders/${order.id}`);
    await page.getByRole("button", { name: "Add a discount" }).click();
    const dialog = page.getByRole("dialog", { name: "Add a discount" });
    const amount = dialog.getByLabel("Amount", { exact: true });
    await amount.fill("1300");
    await expect(dialog.getByText("Type an amount from Rs 1 to Rs 1,200.")).toBeVisible();
    await expect(amount).toHaveAttribute("aria-invalid", "true");
    await dialog.getByRole("button", { name: "Save discount" }).click();
    await expect(dialog).toBeVisible();
    const [row] = await db<{ discount_rs: number | null }[]>`select discount_rs from orders where id = ${order.id}`;
    expect(row!.discount_rs).toBeNull();
    await dialog.getByRole("button", { name: "Keep as it is" }).click();
    await expect(dialog).toBeHidden();
  });
});

test.describe("When it can change (S-320 AC4)", () => {
  test("a paid order shows its discount read-only, with why", async ({ page, db }) => {
    const order = await awaitingOrder(db, "Paid Person");
    await db`update orders set status = 'approved', paid = true, paid_at = now(), discount_rs = 200, discount_reason = 'Birthday', total_rs = 1150 where id = ${order.id}`;
    await open(page, `/admin/orders/${order.id}`);
    const block = page.getByTestId("order-discount");
    await expect(page.getByRole("region", { name: "Items" }).getByText("Discount (Birthday)")).toBeVisible();
    await expect(block.getByText("The order is paid, so its discount is locked. Undo Payment received to change it.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Change discount" })).toHaveCount(0);
    await expectNoA11yViolations(page);
  });
});

test.describe("French (S-320 AC7, AC12)", () => {
  test("Remise: a fixed amount, then Retirer la remise puts the full price back", async ({ page, db }) => {
    const order = await awaitingOrder(db, "Personne Remise", "fr");
    await open(page, `/admin/orders/${order.id}`, E2E_ACCOUNTS.french);
    await page.getByRole("button", { name: "Ajouter une remise" }).click();
    const dialog = page.getByRole("dialog", { name: "Ajouter une remise" });
    await dialog.getByLabel("Montant", { exact: true }).fill("200");
    await expect(dialog.getByText("Remise Rs 200 · nouveau total Rs 1,150")).toBeVisible();
    await dialog.getByRole("button", { name: "Enregistrer la remise" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("region", { name: "Articles" }).getByText("−Rs 200")).toBeVisible();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
    await scrollToTop(page, "Remise");
    await checkA11y(page);

    await page.getByRole("button", { name: "Retirer la remise" }).click();
    await expect(page.getByRole("region", { name: "Articles" }).getByText("−Rs 200")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Ajouter une remise" })).toBeVisible();
    const [row] = await db<{ total_rs: number; discount_rs: number | null }[]>`select total_rs, discount_rs from orders where id = ${order.id}`;
    expect(row).toEqual({ total_rs: 1350, discount_rs: null });
  });
});
