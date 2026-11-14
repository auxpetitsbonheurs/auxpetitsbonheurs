// PRV-02 (privacy-2026.md, S-229 AC6): the Owner's "Anonymise customer" on the E-09 customer
// page. Confirm first, instant pending state, the page turns into "Deleted customer" with the
// orders and totals kept; open orders say what to do instead; an Admin never sees it.
// Accessibility of the section and the dialog at 320/375/1280 px.
import { randomBytes } from "node:crypto";
import type postgres from "postgres";
import { expectNoA11yViolations, expectNoHorizontalScroll, expectTapTargets } from "./support/a11y";
import { signIn } from "./support/admin";
import type { E2eAccount } from "./support/auth-users";
import { E2E_ACCOUNTS, createOrder } from "./support/database";
import { type Page, expect, test } from "./support/fixtures";

const SHOTS = "/tmp/claude-0/-home-user-auxpetitsbonheurs/9106cb54-2393-55df-a3cb-bd8500903b6a/scratchpad";
const isPhone375 = () => test.info().project.name === "phone-375";

async function customer(db: postgres.Sql, orders: { status: string; totalRs: number }[]) {
  const word = `Zq${randomBytes(3).toString("hex")}`;
  const name = `Anna ${word}`;
  const [row] = await db<{ id: string }[]>`insert into customer (name, phone, email, locale, admin_note) values (${name}, '+23057123456', ${`${word.toLowerCase()}@e2e.test`}, 'en', 'Nut allergy') returning id`;
  for (const order of orders) {
    const created = await createOrder(db, name);
    await db`update orders set customer_id = ${row!.id}, status = ${order.status}::order_status, total_rs = ${order.totalRs}, items_total_rs = ${order.totalRs} where id = ${created.id}`;
    await db`delete from customer where id = ${created.customerId}`;
  }
  return { id: row!.id, name };
}

async function open(page: Page, path: string, account: E2eAccount = E2E_ACCOUNTS.owner) {
  await signIn(page, account, path);
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
}

test.describe("Anonymise customer (PRV-02)", () => {
  test("the Owner confirms, the page becomes Deleted customer, orders and totals stay", async ({ page, db }) => {
    const anna = await customer(db, [{ status: "completed", totalRs: 1500 }]);
    await open(page, `/admin/customers/${anna.id}`);
    await expect(page.getByRole("heading", { name: "Personal data" })).toBeVisible();
    await expectNoA11yViolations(page);
    await expectTapTargets(page);
    await expectNoHorizontalScroll(page);

    await page.getByRole("button", { name: "Anonymise customer" }).click();
    const dialog = page.getByRole("dialog", { name: `Anonymise ${anna.name}?` });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("This cannot be undone.", { exact: false })).toBeVisible();
    await expectNoA11yViolations(page);
    if (isPhone375()) await page.screenshot({ path: `${SHOTS}/privacy-anonymise-confirm.png` });

    // Cancel keeps everything; Escape-free path: the visible button.
    await dialog.getByRole("button", { name: "Keep the customer" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("heading", { level: 1, name: anna.name })).toBeVisible();

    await page.getByRole("button", { name: "Anonymise customer" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Anonymise for good" }).click();
    await expect(page.getByText("Customer anonymised. Orders and totals are kept.")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Deleted customer" })).toBeVisible();
    await expect(page.getByText(/^Personal data removed on /)).toBeVisible();
    await expect(page.getByText("+23057123456")).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Private note" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Anonymise customer" })).toHaveCount(0);
    await expect(page.getByText("Total spent:")).toBeVisible();
    await expect(page.getByText("Rs 1,500").first()).toBeVisible();
    if (isPhone375()) await page.screenshot({ path: `${SHOTS}/privacy-anonymised-customer.png`, fullPage: true });
    await expectNoA11yViolations(page);

    const [row] = await db<{ name: string; email: string | null; admin_note: string | null }[]>`select name, email, admin_note from customer where id = ${anna.id}`;
    expect(row).toEqual({ name: "Deleted customer", email: null, admin_note: null });
  });

  test("open orders: the section says to finish them first, with no button", async ({ page, db }) => {
    const anna = await customer(db, [{ status: "approved", totalRs: 900 }]);
    await open(page, `/admin/customers/${anna.id}`);
    await expect(page.getByText("Finish or cancel their open order first, then come back here.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Anonymise customer" })).toHaveCount(0);
    if (isPhone375()) await page.screenshot({ path: `${SHOTS}/privacy-anonymise-open-orders.png`, fullPage: true });
  });

  test("an Admin (French) sees no anonymise section", async ({ page, db }) => {
    const anna = await customer(db, [{ status: "completed", totalRs: 700 }]);
    await open(page, `/admin/customers/${anna.id}`, E2E_ACCOUNTS.french);
    await expect(page.getByText("Note privée")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Données personnelles" })).toHaveCount(0);
  });
});
