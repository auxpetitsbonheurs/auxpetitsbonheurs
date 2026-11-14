// E-07 Calendar, day blocking and prep list on the built Worker and Postgres (S-136..S-140):
// month counts and keyboard grid, week/day lists, block with the orders dialog and Undo, reopen,
// prep list grouping, Share fallback and the print stylesheet, at 320/375/1280 and 200% zoom.
// Each project books its own month so parallel projects never share a day.
import { expectNoA11yViolations, expectNoHorizontalScroll, expectTapTargets, withZoom } from "./support/a11y";
import { signIn } from "./support/admin";
import type { E2eAccount } from "./support/auth-users";
import { setClock } from "./support/clock";
import { E2E_ACCOUNTS, type TestOrder, createOrder } from "./support/database";
import { type Page, expect, test } from "./support/fixtures";

const MONTH: Record<string, string> = { "phone-320": "2027-02", "phone-375": "2027-03", "desktop-1280": "2027-04" };
const month = () => MONTH[test.info().project.name] ?? "2027-05";
/** A Wednesday-ish day well inside the month, not a Sunday (closed by default). */
const day = (n: number) => `${month()}-${String(n).padStart(2, "0")}`;
const orderNumber = (n: number) => `APB-${String(n).padStart(4, "0")}`;
const SCREENSHOTS = "/tmp/claude-0/-home-user-auxpetitsbonheurs/9106cb54-2393-55df-a3cb-bd8500903b6a/scratchpad";

type Db = Parameters<typeof createOrder>[0];

async function orderOn(db: Db, label: string, on: string, options: { status?: string; fulfilment?: "pickup" | "delivery"; start?: string } = {}): Promise<TestOrder> {
  const order = await createOrder(db, label);
  const window = { id: "w", start: options.start ?? "09:00", end: "12:00", label: { en: "Morning", fr: "Matin" } };
  await db`update orders set status = ${options.status ?? "approved"}::order_status, fulfil_on = ${on}, time_window = ${db.json(window)},
    fulfilment = ${options.fulfilment ?? "pickup"}, address = ${options.fulfilment === "delivery" ? "12 Royal Road, Rose Hill" : null} where id = ${order.id}`;
  return order;
}

async function itemOf(db: Db, order: TestOrder, message: string | null, quantity = 1) {
  const [product] = await db<{ id: string; name_en: string }[]>`select id, name_en from product where status = 'available' order by sort_order, name_en limit 1`;
  await db`insert into order_item (order_id, product_id, name_en, original_base_price_rs, unit_base_price_rs, quantity, line_total_rs, cake_message)
    values (${order.id}, ${product!.id}, ${product!.name_en}, 850, 850, ${quantity}, ${850 * quantity}, ${message})`;
  return product!.name_en;
}

async function open(page: Page, baseURL: string, path: string, account: E2eAccount = E2E_ACCOUNTS.helper) {
  // 10:00 in Mauritius, inside the 30-day admin session.
  await setClock(page.context(), baseURL, "2026-12-01T06:00:00Z");
  await signIn(page, account, path);
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
}

/** Tests run in parallel: each clears only the blocks on its own days, before and after. */
async function clearBlocks(db: Db, from: string, to = from) {
  await db`delete from blocked_date where starts_on >= ${from} and ends_on <= ${to}`;
}

test.describe("S-136 month view", () => {
  test("AC1, AC3, AC8, AC9: counts named by fulfilment, blocked cells named, arrow keys and PageDown, no scroll, axe", async ({ page, db, baseURL }) => {
    await clearBlocks(db, day(10));
    await orderOn(db, "Month Pickup A", day(9));
    await orderOn(db, "Month Pickup B", day(9));
    await orderOn(db, "Month Delivery", day(9), { fulfilment: "delivery" });
    await orderOn(db, "Month Cancelled", day(9), { status: "cancelled" });
    await db`insert into blocked_date (starts_on, ends_on, reason) values (${day(10)}, ${day(10)}, 'Family event')`;
    await open(page, baseURL!, `/admin/calendar?month=${month()}`);

    const label = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day(9)}T00:00:00Z`));
    const cell = page.getByRole("link", { name: `${label}: 2 pickup, 1 delivery` });
    await expect(cell).toHaveAttribute("href", `/admin/calendar?view=day&date=${day(9)}`);
    await expect(page.getByRole("link", { name: /: no orders, blocked$/ })).toHaveCount(1);

    await cell.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("link", { name: /: no orders, blocked$/ })).toBeFocused();
    await expectNoHorizontalScroll(page);
    await expectNoA11yViolations(page);
    if (test.info().project.name === "phone-375") await page.screenshot({ path: `${SCREENSHOTS}/manual-calendar-month-375.png`, fullPage: true });

    await page.keyboard.press("PageDown");
    await expect(page).toHaveURL(/month=\d{4}-\d{2}$/);
    await expect(page).not.toHaveURL(new RegExp(`month=${month()}$`));
    await clearBlocks(db, day(10));
  });

  test("AC9: French at 200% zoom keeps cells readable without horizontal scroll", async ({ page, baseURL, db }) => {
    await db`update admin set locale = 'fr' where email = ${E2E_ACCOUNTS.owner.email}`;
    try {
      await open(page, baseURL!, `/admin/calendar?month=${month()}`, E2E_ACCOUNTS.owner);
      await expect(page.getByRole("link", { name: "Semaine" })).toBeVisible();
      await withZoom(page, 2, () => expectNoHorizontalScroll(page));
    } finally {
      await db`update admin set locale = 'en' where email = ${E2E_ACCOUNTS.owner.email}`;
    }
  });
});

test.describe("S-137 week and day lists", () => {
  test("AC1, AC4: the week lists orders by window; a row opens the order", async ({ page, db, baseURL }) => {
    const late = await orderOn(db, "Week Late", day(15), { start: "14:00" });
    const early = await orderOn(db, "Week Early", day(15), { start: "09:00" });
    await open(page, baseURL!, `/admin/calendar?view=week&date=${day(15)}`);

    const rows = page.getByRole("link", { name: /^APB-\d+, Week (Early|Late), / });
    await expect(rows).toHaveText([new RegExp(orderNumber(early.number)), new RegExp(orderNumber(late.number))]);
    await expect(page.getByText("Nothing planned.").first()).toBeVisible();
    await expectTapTargets(page);
    await rows.first().click();
    await expect(page).toHaveURL(`/admin/orders/${early.id}`);
  });
});

test.describe("S-138 block and reopen", () => {
  test("AC1, AC4, AC12: a free day blocks at once with Undo; Reopen brings it back", async ({ page, db, baseURL }) => {
    await clearBlocks(db, day(16));
    await open(page, baseURL!, `/admin/calendar?view=day&date=${day(16)}`);
    await expect(page.getByText("No orders on this day.")).toBeVisible();

    await page.getByLabel(/Private reason/).fill("Family event");
    await page.getByRole("button", { name: "Block this day" }).click();
    await expect(page.getByTestId("calendar-toast")).toContainText("Day blocked");
    await expect(page.getByText("Private reason: Family event")).toBeVisible();
    if (test.info().project.name === "phone-375") await page.screenshot({ path: `${SCREENSHOTS}/manual-calendar-day-blocked-375.png`, fullPage: true });
    const undo = page.getByRole("button", { name: /^Undo blocking / });
    await undo.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Block this day" })).toBeVisible();
    expect(await db`select id from blocked_date where starts_on = ${day(16)}`).toHaveLength(0);

    await page.getByRole("button", { name: "Block this day" }).click();
    await page.getByRole("button", { name: "Reopen this day" }).click();
    await expect(page.getByTestId("calendar-toast")).toContainText("Day reopened");
    expect(await db`select id from blocked_date where starts_on = ${day(16)}`).toHaveLength(0);
  });

  test("AC2: a day with orders asks first, lists them, and keeps them as they are", async ({ page, db, baseURL }) => {
    await clearBlocks(db, day(17));
    const order = await orderOn(db, "Booked Already", day(17));
    await open(page, baseURL!, `/admin/calendar?view=day&date=${day(17)}`);

    await page.getByRole("button", { name: "Block this day" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText(orderNumber(order.number));
    await expect(dialog).toContainText("These orders stay as they are. Contact the customers if needed.");
    await expectNoA11yViolations(page);
    if (test.info().project.name === "phone-375") await page.screenshot({ path: `${SCREENSHOTS}/manual-calendar-block-dialog-375.png` });
    await dialog.getByRole("button", { name: "Block the day" }).click();
    await expect(page.getByText("This blocked day still has orders")).toBeVisible();
    expect((await db<{ status: string }[]>`select status from orders where id = ${order.id}`)[0]!.status).toBe("approved");
    await clearBlocks(db, day(17));
  });

  test("AC5: a day inside an Owner range shows no action for an Admin", async ({ page, db, baseURL }) => {
    await clearBlocks(db, day(20), day(24));
    await db`insert into blocked_date (starts_on, ends_on) values (${day(20)}, ${day(24)})`;
    await open(page, baseURL!, `/admin/calendar?view=day&date=${day(22)}`);
    await expect(page.getByText("Blocked for the whole period")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reopen this day" })).toHaveCount(0);
    await clearBlocks(db, day(20), day(24));
  });
});

test.describe("S-139, S-140 prep list", () => {
  test("identical cakes merge with their messages; Share copies without customer data; print hides the chrome", async ({ page, db, baseURL, context }) => {
    const a = await orderOn(db, "Prep Customer One", day(18));
    const b = await orderOn(db, "Prep Customer Two", day(18));
    const pending = await orderOn(db, "Prep Pending", day(18), { status: "pending_approval" });
    const name = await itemOf(db, a, "Happy Bday Ana");
    await itemOf(db, b, "Joyeux anniversaire 🎂");
    await itemOf(db, pending, null, 5);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await open(page, baseURL!, `/admin/calendar/${day(18)}/prep`);

    await expect(page.getByRole("heading", { name })).toBeVisible();
    await expect(page.getByText("2 orders, 2 items")).toBeVisible();
    await expect(page.getByText("2 ×")).toBeVisible();
    await expect(page.getByText("Happy Bday Ana")).toBeVisible();
    await expect(page.getByText("Joyeux anniversaire 🎂")).toBeVisible();
    await expect(page.locator("main")).not.toContainText("Prep Customer");
    await expectNoA11yViolations(page);
    await expectNoHorizontalScroll(page);
    await expectTapTargets(page);
    if (test.info().project.name === "phone-375") await page.screenshot({ path: `${SCREENSHOTS}/manual-prep-list-375.png`, fullPage: true });

    // No Web Share in a desktop Chromium context: the text is copied (S-140 AC2).
    await page.evaluate(() => Object.defineProperty(navigator, "share", { value: undefined, configurable: true }));
    await page.getByRole("button", { name: "Share" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Copied" })).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain("Happy Bday Ana");
    expect(copied).not.toContain("Prep Customer");

    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("button", { name: "Print" })).toBeHidden();
    await expect(page.locator("[data-admin-frame] > header").first()).toBeHidden();
    expect(await page.locator("[data-prep-sheet] h2").first().evaluate((el) => getComputedStyle(el).color)).toBe("rgb(0, 0, 0)");
  });

  test("an empty day shows the empty state without Share or Print", async ({ page, baseURL }) => {
    await open(page, baseURL!, `/admin/calendar/${day(19)}/prep`);
    await expect(page.getByText("No orders to prepare on this day.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Share" })).toHaveCount(0);
  });
});
