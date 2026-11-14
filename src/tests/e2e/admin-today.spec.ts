// E-06 Today on a phone: tiles, today/tomorrow lists, one-tap Next with Undo (S-120, S-121),
// against the built Worker and Postgres. The test clock puts "today" on a date only these tests
// use, per project, so the other specs' orders do not crowd the lists.
import {
  expectKeyboardOperable,
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  expectNothingClipped,
  expectTapTargets,
  withZoom,
} from "./support/a11y";
import { signIn } from "./support/admin";
import { setClock } from "./support/clock";
import { E2E_ACCOUNTS, type TestOrder, createOrder } from "./support/database";
import { type Page, expect, test } from "./support/fixtures";

const orderNumber = (n: number) => `APB-${String(n).padStart(4, "0")}`;
// Within the 30-day admin session age, away from the dates other specs book.
const DAY: Record<string, string> = { "phone-320": "2026-12-08", "phone-375": "2026-12-09", "desktop-1280": "2026-12-10" };
const today = () => DAY[test.info().project.name] ?? "2026-12-07";

type Db = Parameters<typeof createOrder>[0];

async function orderIn(db: Db, label: string, status: string, on = today(), start = "09:00"): Promise<TestOrder> {
  const order = await createOrder(db, label);
  const window = { id: "w", start, end: "12:00", label: { en: "Morning", fr: "Matin" } };
  await db`update orders set status = ${status}::order_status, fulfil_on = ${on}, time_window = ${db.json(window)} where id = ${order.id}`;
  return order;
}

async function openToday(page: Page, baseURL: string, account = E2E_ACCOUNTS.helper) {
  // 08:00 in Mauritius on the test day.
  await setClock(page.context(), baseURL, `${today()}T04:00:00Z`);
  await signIn(page, account, "/admin");
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
}

test.describe("S-120 Today", () => {
  test("AC1, AC2, AC4: tiles name their counts and link to the lists; today's orders by window, tomorrow's below", async ({ page, db, baseURL }) => {
    const late = await orderIn(db, "Late Window", "approved", today(), "14:00");
    const early = await orderIn(db, "Early Window", "approved", today(), "09:00");
    const next = await orderIn(db, "Tomorrow Order", "approved", new Date(Date.parse(`${today()}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10));
    await orderIn(db, "Cancelled Today", "cancelled");
    await openToday(page, baseURL!);

    await expect(page.getByRole("link", { name: /^To review: \d+ orders?$/ })).toHaveAttribute("href", "/admin/orders?tab=review");
    await expect(page.getByRole("link", { name: /^Unpaid: \d+ orders?$/ })).toHaveAttribute("href", "/admin/orders?tab=upcoming&paid=false");
    const todayList = page.getByRole("list", { name: /^Today, / });
    const links = todayList.getByRole("link", { name: /^APB-\d+, (Early|Late) Window, / });
    await expect(links).toHaveText([new RegExp(orderNumber(early.number)), new RegExp(orderNumber(late.number))]);
    await expect(todayList).not.toContainText("Cancelled Today");
    await expect(page.getByRole("list", { name: /^Tomorrow, / })).toContainText(orderNumber(next.number));
  });
});

test.describe("S-121 one-tap Next with Undo", () => {
  test("AC1, AC2, AC7: Next is named for the order, shows the new status at once, then Undo by keyboard puts it back", async ({ page, db, baseURL }) => {
    const order = await orderIn(db, "Tap Me", "approved");
    await openToday(page, baseURL!);

    const next = page.getByRole("button", { name: `Mark ${orderNumber(order.number)} in preparation` });
    expect((await next.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await next.click();
    const toast = page.getByTestId("today-toast");
    await expect(toast).toHaveText(new RegExp(`${orderNumber(order.number)} marked In preparation\\.`));
    const undo = page.getByRole("button", { name: `Undo: put ${orderNumber(order.number)} back to Approved` });
    await undo.focus();
    await page.keyboard.press("Enter");
    await expect(toast).toHaveText(new RegExp(`${orderNumber(order.number)} is back to Approved\\.`));
    await expect.poll(async () => (await db<{ status: string }[]>`select status from orders where id = ${order.id}`)[0]!.status).toBe("approved");
    expect(await db`select id from email_outbox where order_id = ${order.id}`).toHaveLength(0);
  });

  test("AC3: an order waiting for review only opens its detail", async ({ page, db, baseURL }) => {
    const order = await orderIn(db, "Needs Review", "pending_approval");
    await openToday(page, baseURL!);

    await expect(page.getByRole("link", { name: new RegExp(`^${orderNumber(order.number)}, Needs Review`) })).toHaveAttribute("href", `/admin/orders/${order.id}`);
    await expect(page.getByRole("button", { name: new RegExp(`^Mark ${orderNumber(order.number)} `) })).toHaveCount(0);
  });

  test("AC4: Undo after another admin moved the order says it could not, and nothing changes", async ({ page, db, baseURL }) => {
    const order = await orderIn(db, "Moved On", "approved");
    await openToday(page, baseURL!);

    await page.getByRole("button", { name: `Mark ${orderNumber(order.number)} in preparation` }).click();
    await expect(page.getByTestId("today-toast")).toContainText("marked In preparation");
    await db`update orders set status = 'ready_for_pickup', version = version + 1 where id = ${order.id}`;
    await page.getByRole("button", { name: /^Undo: / }).click();
    await expect(page.getByTestId("today-toast")).toHaveText(/Could not undo, the order changed\./);
    const [row] = await db<{ status: string }[]>`select status from orders where id = ${order.id}`;
    expect(row!.status).toBe("ready_for_pickup");
  });
});

test.describe("S-120 AC9 layout and accessibility", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`keyboard, 200% zoom, 44 px targets, no clipping, axe clean (${colorScheme})`, async ({ page, db, baseURL }) => {
      await orderIn(db, `Layout ${colorScheme}`, "in_preparation");
      await page.emulateMedia({ colorScheme });
      await openToday(page, baseURL!);
      for (const zoom of [1, 2]) {
        await withZoom(page, zoom, async () => {
          await expectNoHorizontalScroll(page);
          await expectNothingClipped(page);
          await expectTapTargets(page);
          await expectKeyboardOperable(page, 120);
        });
      }
      await expectNoA11yViolations(page);
    });
  }
});
