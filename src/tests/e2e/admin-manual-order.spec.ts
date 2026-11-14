// E-07 Add order on a phone (S-131..S-135, S-139 AC3): a product and a free-text item, Save to the
// order screen with its toast and tracking link, the order in that day's prep list, customer
// matching, warnings that never block, Paid, and the form's accessibility at 320/375/1280 px.
import { expectNoA11yViolations, expectNoHorizontalScroll, expectTapTargets, withZoom } from "./support/a11y";
import { signIn } from "./support/admin";
import { setClock } from "./support/clock";
import { E2E_ACCOUNTS, createOrder } from "./support/database";
import { type Page, expect, test } from "./support/fixtures";

const SCREENSHOTS = "/tmp/claude-0/-home-user-auxpetitsbonheurs/9106cb54-2393-55df-a3cb-bd8500903b6a/scratchpad";
/** A day per project (a Tuesday in June 2027), away from the other specs' dates. */
const DAY: Record<string, string> = { "phone-320": "2027-06-08", "phone-375": "2027-06-15", "desktop-1280": "2027-06-22" };
const day = () => DAY[test.info().project.name] ?? "2027-06-29";

type Db = Parameters<typeof createOrder>[0];

/** A plain menu product: available, not seasonal, no required option. */
async function plainProduct(db: Db): Promise<string> {
  const [row] = await db<{ name_en: string }[]>`
    select p.name_en from product p
    where p.status = 'available' and p.seasonal_starts_on is null
      and not exists (select 1 from option_group g where g.product_id = p.id and g.required)
    order by p.sort_order, p.name_en limit 1`;
  return row!.name_en;
}

async function openForm(page: Page, baseURL: string) {
  // 10:00 in Mauritius on 1 Dec 2026, inside the 30-day admin session.
  await setClock(page.context(), baseURL, "2026-12-01T06:00:00Z");
  await signIn(page, E2E_ACCOUNTS.helper, "/admin/orders/new");
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
}

async function addProduct(page: Page, name: string) {
  await page.getByRole("button", { name: "Add a product" }).click();
  const sheet = page.getByRole("dialog", { name: "Add a product" });
  await sheet.getByRole("button", { name: `Choose ${name}` }).click();
  await sheet.getByRole("button", { name: "Add to the order" }).click();
  await expect(sheet).toHaveCount(0);
}

async function addFreeText(page: Page, name: string, price: string) {
  await page.getByRole("button", { name: "Add a free-text item" }).click();
  const sheet = page.getByRole("dialog", { name: "Add a free-text item" });
  await sheet.getByLabel("Item name").fill(name);
  await sheet.getByLabel("Price each (Rs)").fill(price);
  await sheet.getByRole("button", { name: "Add to the order" }).click();
  await expect(sheet).toHaveCount(0);
}

async function contact(page: Page, name: string, phone: string) {
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Phone", { exact: true }).fill(phone);
}

test.describe("S-131, S-132, S-135 Add order", () => {
  test("a product and a free-text item save as Approved; the order screen confirms with the tracking link; the prep list has both", async ({ page, db, baseURL }) => {
    const product = await plainProduct(db);
    await openForm(page, baseURL!);
    await expect(page.getByText("Add a product or a custom item to start.")).toBeVisible();

    await addProduct(page, product);
    await addFreeText(page, "Gift box", "400");
    await page.getByLabel("Date", { exact: true }).fill(day());
    await contact(page, "Walk In Customer", `5${String(Date.now()).slice(-7)}`);
    await page.getByRole("switch", { name: "Paid (no)" }).check();
    await expect(page.getByRole("switch", { name: "Paid (yes)" })).toBeChecked();
    await expectNoHorizontalScroll(page);
    if (test.info().project.name === "phone-375") await page.screenshot({ path: `${SCREENSHOTS}/manual-add-order-375.png`, fullPage: true });
    await page.getByRole("button", { name: "Save order" }).click();

    await expect(page).toHaveURL(/\/admin\/orders\/[0-9a-f-]{36}\?created=1/);
    await expect(page.getByRole("status").filter({ hasText: /^Order APB-\d+ saved\.$/ })).toBeVisible();
    await expect(page.getByTestId("tracking-url")).toContainText("/t/");
    if (test.info().project.name === "phone-375") await page.screenshot({ path: `${SCREENSHOTS}/manual-order-saved-375.png`, fullPage: true });
    const id = page.url().split("/").pop()!.split("?")[0]!;
    const [row] = await db<{ status: string; source: string; paid: boolean }[]>`select status, source, paid from orders where id = ${id}`;
    expect(row).toEqual({ status: "approved", source: "manual", paid: true });

    await page.goto(`/admin/calendar/${day()}/prep`);
    await expect(page.getByRole("heading", { name: product })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Other" })).toBeVisible();
    await expect(page.getByText("Gift box")).toBeVisible();
    await db`update orders set status = 'cancelled' where id = ${id}`;
  });
});

test.describe("S-133 the returning customer", () => {
  test("a phone in another format finds the customer; Use this customer fills the name", async ({ page, db, baseURL }) => {
    const local = `5${String(Date.now()).slice(-7)}`;
    await db`insert into customer (name, phone) values ('Anna Returning', ${`+230${local}`})`;
    await openForm(page, baseURL!);

    await page.getByLabel("Phone", { exact: true }).fill(`${local.slice(0, 4)} ${local.slice(4)}`);
    const card = page.getByTestId("customer-match");
    await expect(card).toContainText("Existing customer: Anna Returning, 0 orders. Use details?");
    await expectNoA11yViolations(page);
    await card.getByRole("button", { name: "Use this customer" }).click();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Anna Returning");
  });
});

test.describe("S-134 warnings never block", () => {
  test("a past date and a closed Sunday warn in words above Save; the form passes axe, tap targets and 200% zoom", async ({ page, baseURL }) => {
    await openForm(page, baseURL!);
    await addFreeText(page, "Cake slice", "150");
    await page.getByLabel("Date", { exact: true }).fill("2026-11-29");
    const warnings = page.getByTestId("manual-warnings");
    await expect(warnings).toContainText("This date is in the past; the order will be recorded as a past sale.");
    await page.getByLabel("Date", { exact: true }).fill("2027-06-13");
    await expect(warnings).toContainText("This day is blocked: the bakery is closed that weekday.");
    await expect(page.getByRole("button", { name: "Save order" })).toBeEnabled();
    await expectNoA11yViolations(page);
    await expectTapTargets(page);
    await withZoom(page, 2, () => expectNoHorizontalScroll(page));
  });
});
