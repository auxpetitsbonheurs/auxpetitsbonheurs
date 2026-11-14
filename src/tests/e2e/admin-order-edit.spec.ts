// E-06 edit an order on a phone (S-122, S-123): items with steppers, free-text item, live total,
// total set by hand, date warnings after save, the updated email, stale saves, and the edit
// screen's accessibility, against the built Worker and Postgres.
import {
  expectKeyboardOperable,
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  expectNothingClipped,
  expectTapTargets,
  withZoom,
} from "./support/a11y";
import { signIn } from "./support/admin";
import { E2E_ACCOUNTS, type TestOrder, createOrder } from "./support/database";
import { type Page, expect, test } from "./support/fixtures";

type Db = Parameters<typeof createOrder>[0];

async function editable(db: Db, label: string, status = "approved"): Promise<TestOrder> {
  const order = await createOrder(db, label);
  await db`update orders set status = ${status}::order_status, contact_email = ${`${label.toLowerCase().replace(/\W+/g, "-")}@e2e.test`} where id = ${order.id}`;
  return order;
}

async function openEdit(page: Page, order: TestOrder) {
  await signIn(page, E2E_ACCOUNTS.owner, `/admin/orders/${order.id}/edit`);
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
}

async function addFreeText(page: Page, name: string, price: string, quantity = "1") {
  await page.getByRole("button", { name: "Add a free-text item" }).click();
  const sheet = page.getByRole("dialog", { name: "Add a free-text item" });
  await sheet.getByLabel("Item name").fill(name);
  await sheet.getByLabel("Price each (Rs)").fill(price);
  await sheet.getByLabel("Quantity").fill(quantity);
  await sheet.getByRole("button", { name: "Add to the order" }).click();
  await expect(sheet).toHaveCount(0);
}

/** Keyboard walk with the bottom bar pinned: on phones it leaves while a text field has focus (S-033 AC5). */
async function expectFormKeyboardOperable(page: Page) {
  const pin = await page.addStyleTag({ content: "[data-bottom-bar] { display: block !important; }" });
  try {
    await expectKeyboardOperable(page, 120);
  } finally {
    await pin.evaluate((style) => (style as Element).remove());
  }
}

test.describe("S-122 edit an order", () => {
  test("AC1, AC5, AC10, AC11: a free-text item with steppers updates the live total; Save stores the server total and says so", async ({ page, db }) => {
    const order = await editable(db, "Edit Me");
    await openEdit(page, order);

    await expect(page.getByRole("heading", { level: 1, name: /^Edit order APB-/ })).toBeVisible();
    await addFreeText(page, "Gift box", "400");
    await page.getByRole("button", { name: "Increase quantity of Gift box" }).click();
    await expect(page.getByTestId("form-total")).toHaveText("Rs 800");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page).toHaveURL(new RegExp(`/admin/orders/${order.id}\\?updated=1`));
    await expect(page.getByRole("status").filter({ hasText: "Order updated" })).toBeVisible();
    const [row] = await db<{ total_rs: number; version: number }[]>`select total_rs, version from orders where id = ${order.id}`;
    expect(row).toEqual({ total_rs: 800, version: 2 });
  });

  test("AC3: Set total by hand says its state and stores the total, flagged on the order", async ({ page, db }) => {
    const order = await editable(db, "By Hand");
    await openEdit(page, order);

    await addFreeText(page, "Cake", "1000");
    const toggle = page.getByRole("switch", { name: /^Set total by hand \(off\)$/ });
    await toggle.check();
    await expect(page.getByRole("switch", { name: /^Set total by hand \(on\)$/ })).toBeChecked();
    await page.getByLabel("Total (Rs)").fill("900");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page).toHaveURL(/updated=1/);
    await expect(page.getByText("Total set by hand")).toBeVisible();
    const [row] = await db<{ total_rs: number; total_overridden: boolean }[]>`select total_rs, total_overridden from orders where id = ${order.id}`;
    expect(row).toEqual({ total_rs: 900, total_overridden: true });
  });

  test("AC6: a completed order explains why it cannot be edited", async ({ page, db }) => {
    const order = await editable(db, "Done Already", "completed");
    await openEdit(page, order);

    await expect(page.getByText("This order cannot be edited now")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);
  });

  test("AC9: a stale save says the order changed and keeps what was typed", async ({ page, db }) => {
    const order = await editable(db, "Stale Edit");
    await openEdit(page, order);

    await addFreeText(page, "Kept typing", "250");
    await db`update orders set version = version + 1 where id = ${order.id}`;
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByRole("alert").first()).toContainText("This order changed. Reload");
    await expect(page.getByText("Kept typing")).toBeVisible();
  });

  test("AC11: field problems are summarised with links, and the summary takes focus", async ({ page, db }) => {
    const order = await editable(db, "Bad Phone");
    await openEdit(page, order);

    await addFreeText(page, "Cake", "100");
    await page.getByLabel("Phone").fill("12");
    await page.getByRole("button", { name: "Save changes" }).click();

    const summary = page.getByRole("alert").filter({ hasText: "Please check these fields" });
    await expect(summary).toBeFocused();
    // S-126 AC5: the error state is axe clean too.
    await expectNoA11yViolations(page);
    await expect(summary.getByRole("link", { name: "Enter a valid phone number." })).toHaveAttribute("href", "#contact.phone");
  });
});

test.describe("S-123 warnings and the updated email", () => {
  test("AC1, AC2, AC8: a closed day saves with the warning in words; the customer gets one updated email", async ({ page, db }) => {
    const order = await editable(db, "Sunday Move");
    await openEdit(page, order);

    await addFreeText(page, "Cake", "500");
    // Sun 22 Nov 2026: the bakery is closed on Sundays.
    await page.getByLabel("Date").fill("2026-11-22");
    await page.getByRole("button", { name: "Save changes" }).click();

    const warnings = page.getByTestId("edit-warnings");
    await expect(warnings).toContainText("The bakery is closed that day.");
    await expect(warnings).toBeFocused();
    const outbox = await db<{ template: string }[]>`select template from email_outbox where order_id = ${order.id} and template = 'order_updated'`;
    expect(outbox).toHaveLength(1);
  });
});

test.describe("S-122 AC11 layout and accessibility of the edit screen", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`keyboard, 200% zoom, 44 px targets, no clipping, axe clean (${colorScheme}), sheets included`, async ({ page, db }) => {
      const order = await editable(db, `Edit layout ${colorScheme}`);
      await page.emulateMedia({ colorScheme });
      await openEdit(page, order);
      await addFreeText(page, "Cake", "500");
      for (const zoom of [1, 2]) {
        await withZoom(page, zoom, async () => {
          await expectNoHorizontalScroll(page);
          await expectNothingClipped(page);
          await expectTapTargets(page);
          await expectFormKeyboardOperable(page);
        });
      }
      await expectNoA11yViolations(page);
      await page.getByRole("button", { name: "Add a product" }).click();
      await expect(page.getByRole("dialog", { name: "Add a product" })).toBeVisible();
      await expectNoA11yViolations(page);
      await expectTapTargets(page);
    });
  }
});
