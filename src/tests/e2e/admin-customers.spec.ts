// E-09 Customers on a phone and a desktop (S-174..S-177): search by phone digits, more pages
// appended in place, the customer page with Call/WhatsApp and every order, the private note
// with its counter and Saved status, accessibility at 320/375/1280 px and 200% zoom, EN/FR.
// Every spec scopes itself with a search token unique to the project and test.
import { randomBytes } from "node:crypto";
import type postgres from "postgres";
import { expectNoA11yViolations, expectNoHorizontalScroll, expectNothingClipped, expectTapTargets, tabThrough } from "./support/a11y";
import { signIn } from "./support/admin";
import type { E2eAccount } from "./support/auth-users";
import { E2E_ACCOUNTS, createOrder } from "./support/database";
import { type Page, expect, test } from "./support/fixtures";

const SHOTS = "/tmp/claude-0/-home-user-auxpetitsbonheurs/9106cb54-2393-55df-a3cb-bd8500903b6a/scratchpad";
const isPhone375 = () => test.info().project.name === "phone-375";

/** A word no other customer has, so a search shows only this test's rows. */
const token = () => `Zq${randomBytes(3).toString("hex")}`;

async function customerWithOrders(db: postgres.Sql, name: string, orders: { status: string; totalRs: number; contactName?: string }[]) {
  const phone = `+2305${String(randomBytes(4).readUInt32BE() % 10_000_000).padStart(7, "0")}`;
  const [customer] = await db<{ id: string }[]>`insert into customer (name, phone, email, locale) values (${name}, ${phone}, ${`${name.toLowerCase().replace(/\W+/g, ".")}@e2e.test`}, 'fr') returning id`;
  for (const order of orders) {
    const created = await createOrder(db, order.contactName ?? name);
    await db`update orders set customer_id = ${customer!.id}, status = ${order.status}::order_status, total_rs = ${order.totalRs}, items_total_rs = ${order.totalRs} where id = ${created.id}`;
    // createOrder made its own customer for this order: gone, so searches see only ours.
    await db`delete from customer where id = ${created.customerId}`;
  }
  return { id: customer!.id, phone };
}

async function open(page: Page, path: string, account: E2eAccount = E2E_ACCOUNTS.owner) {
  await signIn(page, account, path);
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
}

async function pinnedTabThrough(page: Page) {
  // The bottom bar leaves phones while a text field has focus (S-033 AC5): pinned so stops keep their numbers.
  const pin = await page.addStyleTag({ content: "[data-bottom-bar] { display: block !important; }" });
  try {
    return await tabThrough(page, 120);
  } finally {
    await pin.evaluate((style) => (style as Element).remove());
  }
}

test.describe("S-174, S-175 list and search", () => {
  test("search by phone digits, totals per definition, and the row opens the customer", async ({ page, db }) => {
    const word = token();
    const anna = await customerWithOrders(db, `Anna ${word}`, [
      { status: "completed", totalRs: 1000 },
      { status: "completed", totalRs: 500 },
      { status: "cancelled", totalRs: 900 },
    ]);
    await open(page, `/admin/customers?q=${word}`);
    await expect(page.getByRole("status").filter({ hasText: "1 customer" })).toBeVisible();
    const local = anna.phone.slice(4);
    await page.getByLabel("Search customers").fill(`${local.slice(0, 4)} ${local.slice(4)}`);
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/q=/);
    const card = page.getByRole("listitem").filter({ hasText: `Anna ${word}` });
    await expect(card).toContainText(/Orders:\s*2/);
    await expect(card).toContainText(/Total spent:\s*Rs 1,500/);
    if (isPhone375()) await page.screenshot({ path: `${SHOTS}/sales-customers.png`, fullPage: true });
    await card.getByRole("link", { name: `Anna ${word}` }).click();
    await expect(page).toHaveURL(`/admin/customers/${anna.id}`);
  });

  test("no match shows the text and Clear; sort applies at once", async ({ page }) => {
    const word = token();
    await open(page, `/admin/customers?q=${word}`);
    await expect(page.getByText(`No match for ‘${word}’.`)).toBeVisible();
    await page.getByLabel("Sort by").selectOption("name");
    await expect(page).toHaveURL(/sort=name/);
    await page.getByRole("link", { name: "Clear" }).click();
    await expect(page).toHaveURL("/admin/customers?sort=name");
    await expect(page.getByLabel("Sort by")).toHaveValue("name");
  });

  test("S-174 AC4: 31 matches, 30 then one more appended in place without duplicates", async ({ page, db }) => {
    const word = token();
    for (let i = 0; i < 31; i += 1) await db`insert into customer (name, phone) values (${`${word} ${String(i).padStart(2, "0")}`}, '+23050000099')`;
    await open(page, `/admin/customers?q=${word}&sort=name`);
    const cards = page.getByRole("list", { name: "Customers" }).getByRole("listitem");
    await expect(cards).toHaveCount(30);
    await page.getByRole("link", { name: "Show more customers" }).click();
    await expect(cards).toHaveCount(31);
    await expect(cards.last()).toContainText(`${word} 30`);
    await expect(page).toHaveURL(new RegExp(`q=${word}&sort=name$`));
    await expect(page.getByRole("link", { name: "Show more customers" })).toHaveCount(0);
  });
});

test.describe("S-176, S-177 the customer page", () => {
  test("contact links, orders with badges and snapshot names, the note saves and stays", async ({ page, db }) => {
    const word = token();
    const anna = await customerWithOrders(db, `Anna ${word}`, [
      { status: "completed", totalRs: 1000, contactName: "Anna" },
      { status: "declined", totalRs: 400, contactName: "A. Rault" },
    ]);
    await open(page, `/admin/customers/${anna.id}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Anna ${word}`);
    await expect(page.getByRole("link", { name: `Call Anna ${word}` })).toHaveAttribute("href", `tel:${anna.phone}`);
    await expect(page.getByRole("link", { name: `WhatsApp Anna ${word}` })).toHaveAttribute("href", `https://wa.me/${anna.phone.slice(1)}`);
    await expect(page.getByText("Total spent:")).toBeVisible();
    await expect(page.getByText("Ordered as A. Rault")).toBeVisible();
    await expect(page.getByText("Refused").or(page.getByText("Declined"))).toBeVisible();

    const note = page.getByRole("textbox", { name: "Private note" });
    await note.fill("Allergic to nuts");
    await expect(page.getByText("16 of 2000 characters")).toBeVisible();
    await page.getByRole("button", { name: "Save note" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
    if (isPhone375()) await page.screenshot({ path: `${SHOTS}/sales-customer-detail.png`, fullPage: true });
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Private note" })).toHaveValue("Allergic to nuts");

    await page.getByRole("textbox", { name: "Private note" }).fill("x".repeat(2001));
    await expect(page.getByRole("alert")).toHaveText("The note can have at most 2000 characters.");
    await expect(page.getByRole("button", { name: "Save note" })).toBeDisabled();
  });

  test("a failed save keeps the text and says so", async ({ page, db }) => {
    const anna = await customerWithOrders(db, `Anna ${token()}`, []);
    await open(page, `/admin/customers/${anna.id}`);
    await expect(page.getByText("No orders yet.")).toBeVisible();
    await page.route(`**/admin/customers/${anna.id}*`, (route) => (route.request().method() === "POST" ? route.fulfill({ status: 500, body: "boom" }) : route.continue()));
    await page.getByRole("textbox", { name: "Private note" }).fill("Keep me");
    await page.getByRole("button", { name: "Save note" }).click();
    await expect(page.getByRole("textbox", { name: "Private note" })).toHaveValue("Keep me");
    await expect(page.getByRole("alert")).toHaveText("The note was not saved. Your text is still here: try again.");
  });

  test("unknown customer: Customer not found", async ({ page }) => {
    await open(page, "/admin/customers/00000000-0000-4000-8000-000000000999");
    await expect(page.getByRole("heading", { name: "Customer not found" })).toBeVisible();
  });

  test("French for a French admin", async ({ page, db }) => {
    const anna = await customerWithOrders(db, `Anna ${token()}`, [{ status: "completed", totalRs: 1250 }]);
    await open(page, `/admin/customers/${anna.id}`, E2E_ACCOUNTS.french);
    await expect(page.getByText("Note privée")).toBeVisible();
    await expect(page.getByText("Total dépensé :").or(page.getByText("Total dépensé:"))).toBeVisible();
    await expectNoA11yViolations(page);
  });
});

test.describe("accessibility (S-174 AC9, S-175 AC8, S-176 AC7, S-177 AC7)", () => {
  for (const which of ["list", "detail"] as const) {
    test(`${which}: axe, tap targets, keyboard order, no sideways scroll, 200% zoom`, async ({ page, db }) => {
      const word = token();
      const anna = await customerWithOrders(db, `Anna ${word}`, [{ status: "completed", totalRs: 800 }]);
      await open(page, which === "list" ? `/admin/customers?q=${word}` : `/admin/customers/${anna.id}`);
      await expectNoA11yViolations(page);
      await expectTapTargets(page);
      await expectNoHorizontalScroll(page);
      await expectNothingClipped(page);
      const { stops, total } = await pinnedTabThrough(page);
      expect(stops.map((s) => s.index)).toEqual([...Array(total).keys()]);
      expect(stops.filter((s) => !s.visibleFocus).map((s) => s.name)).toEqual([]);
      await expectNoA11yViolations(page, { zoom: 2 });
    });
  }
});
