// E-06 order detail on a phone: optimistic status actions with toasts, More actions sheet,
// Decline/Cancel dialogs, paid flag, private note autosave, contact links and the conflict
// Alert (S-113, S-114, S-116, S-117, S-119, S-124), against the built Worker and Postgres.
import {
  expectKeyboardOperable,
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  expectNothingClipped,
  expectTapTargets,
  withZoom,
} from "./support/a11y";
import { signIn } from "./support/admin";
import { expectActionInReach } from "./support/order-actions";
import { E2E_ACCOUNTS, type TestOrder, createOrder } from "./support/database";
import { type Page, expect, test } from "./support/fixtures";

const SHOTS = "/tmp/claude-0/-home-user-auxpetitsbonheurs/9106cb54-2393-55df-a3cb-bd8500903b6a/scratchpad";
const orderNumber = (n: number) => `APB-${String(n).padStart(4, "0")}`;

/** Keyboard walk with the bottom bar pinned: on phones it leaves while a text field has focus (S-033 AC5), renumbering the stops. */
async function expectFormKeyboardOperable(page: Page) {
  const pin = await page.addStyleTag({ content: "[data-bottom-bar] { display: block !important; }" });
  try {
    await expectKeyboardOperable(page);
  } finally {
    await pin.evaluate((style) => (style as Element).remove());
  }
}
const isPhone375 = () => test.info().project.name === "phone-375";

type Db = Parameters<typeof createOrder>[0];

async function orderIn(db: Db, label: string, status: string, extra: { delivery?: boolean } = {}): Promise<TestOrder> {
  const order = await createOrder(db, label);
  await db`update orders set status = ${status}::order_status, contact_email = ${`${label.toLowerCase().replace(/\W+/g, "-")}@e2e.test`} where id = ${order.id}`;
  if (extra.delivery) await db`update orders set fulfilment = 'delivery', address = '12 Royal Road, Rose Hill', landmark = 'Blue gate' where id = ${order.id}`;
  return order;
}

async function open(page: Page, order: TestOrder, account: Parameters<typeof signIn>[1] = E2E_ACCOUNTS.owner) {
  await signIn(page, account, `/admin/orders/${order.id}`);
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
}

/** Holds the next POST to the order until `release()`, to see the optimistic state. */
async function holdPost(page: Page, order: TestOrder) {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(`**/admin/orders/${order.id}*`, async (route) => {
    if (route.request().method() === "POST") await held;
    await route.continue();
  });
  return release;
}

test.describe("S-117 move forward and back", () => {
  test("AC1, AC8, AC9: Next is named after the target, shows the new status at once, toasts, and moves focus to the next step", async ({ page, db }) => {
    const order = await orderIn(db, "Next Step", "approved");
    await open(page, order);
    const release = await holdPost(page, order);

    const next = page.getByRole("button", { name: "Mark in preparation" });
    await expectActionInReach(page, next);
    expect((await next.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await next.click();
    await expect(next).toHaveAttribute("aria-busy", "true");
    await expect(page.getByTestId("order-status")).toHaveText("In preparation");
    release();

    const result = page.getByTestId("approve-result");
    await expect(result).toHaveText(`Order ${orderNumber(order.number)} is now In preparation.`);
    // The pressed button is gone: focus is on the result, and the next step is offered.
    await expect(result).toBeFocused();
    await expect(page.getByRole("button", { name: "Mark ready for pickup" })).toBeVisible();
    if (isPhone375()) await page.screenshot({ path: `${SHOTS}/orders-status-change.png` });
    const [row] = await db<{ status: string; version: number }[]>`select status, version from orders where id = ${order.id}`;
    expect(row).toEqual({ status: "in_preparation", version: 2 });
    expect(await db`select id from email_outbox where order_id = ${order.id}`).toHaveLength(0);
  });

  test("AC2, AC4, AC7: Ready queues the email; Back one step from the sheet returns with no email and logs it", async ({ page, db }) => {
    const order = await orderIn(db, "Back Step", "in_preparation");
    await open(page, order, E2E_ACCOUNTS.helper);

    await page.getByRole("button", { name: "Mark ready for pickup" }).click();
    await expect(page.getByTestId("order-status")).toHaveText("Ready for pickup");
    await expect(page.getByRole("button", { name: "Mark completed" })).toBeVisible();
    await page.getByRole("button", { name: "More actions" }).click();
    const sheet = page.getByRole("dialog", { name: `Order ${orderNumber(order.number)}` });
    await sheet.getByRole("button", { name: "Back one step (to In preparation)" }).click();

    await expect(page.getByTestId("approve-result")).toHaveText(/is back to In preparation\.$/);
    await expect(page.getByRole("list", { name: "Activity" })).toContainText("Moved back to In preparation by Sarah");
    const outbox = await db<{ template: string }[]>`select template from email_outbox where order_id = ${order.id}`;
    expect(outbox.map((r) => r.template)).toEqual(["ready_for_pickup"]);
  });
});

test.describe("S-116, S-119 dialogs and the paid flag", () => {
  test("S-116 AC2, AC8, AC9: Refuse asks first, traps focus, Esc returns focus, then refuses with the reason", async ({ page, db }) => {
    const order = await orderIn(db, "Decline Me", "pending_approval");
    await open(page, order);

    const more = page.getByRole("button", { name: "More actions" });
    await more.click();
    await page.getByRole("dialog").getByRole("button", { name: "Refuse order" }).click();
    const dialog = page.getByRole("dialog", { name: `Refuse order ${orderNumber(order.number)}?` });
    await expect(dialog).toContainText("Shown on the customer's tracking page.");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(more).toBeFocused();

    await more.click();
    await page.getByRole("dialog").getByRole("button", { name: "Refuse order" }).click();
    await dialog.getByLabel("Reason for the customer").fill("Fully booked that weekend");
    await dialog.getByRole("button", { name: `Refuse order ${orderNumber(order.number)}` }).click();

    await expect(page.getByTestId("order-status")).toHaveText("Refused");
    await expect(page.getByTestId("approve-result")).toHaveText(`Order ${orderNumber(order.number)} refused.`);
    await expect(page.getByRole("region", { name: "Payment" })).toContainText("Fully booked that weekend");
    const [row] = await db<{ decline_reason: string }[]>`select decline_reason from orders where id = ${order.id}`;
    expect(row!.decline_reason).toBe("Fully booked that weekend");
  });

  test("S-119 AC1, AC2, AC5: Mark paid at once, then Cancel warns about the refund, keeps the paid flag and tracks the refund", async ({ page, db }) => {
    const order = await orderIn(db, "Paid Then Cancel", "approved");
    await open(page, order);

    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Mark paid" }).click();
    await expect(page.getByText("Paid", { exact: true })).toBeVisible();
    await expect(page.getByTestId("approve-result")).toHaveText(`Order ${orderNumber(order.number)} marked paid.`);

    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel order" }).click();
    const dialog = page.getByRole("dialog", { name: "Cancel this order?" });
    await expect(dialog).toContainText("after cancelling it you will refund Rs 850 by Juice");
    await dialog.getByRole("button", { name: `Cancel ${orderNumber(order.number)}` }).click();

    await expect(page.getByTestId("order-status")).toHaveText("Cancelled");
    await expect(page.getByTestId("approve-result")).toHaveText(`Order ${orderNumber(order.number)} cancelled.`);
    const [row] = await db<{ status: string; paid: boolean; refund_due_rs: number }[]>`select status, paid, refund_due_rs from orders where id = ${order.id}`;
    expect(row).toEqual({ status: "cancelled", paid: true, refund_due_rs: 850 });
    // The refund is tracked like a refusal's (juice-payment spec): Refunded is offered in the bar.
    await expect(page.getByText("Refund Rs 850 to the customer by Juice")).toBeVisible();
    await expect(page.getByRole("list", { name: "Activity" })).toContainText("refund outside the site");
  });
});

test.describe("S-124 two admins on one order", () => {
  test("AC1, AC4, AC7: the stale admin gets the focused Alert; Reload shows the new status and actions", async ({ page, db }) => {
    const order = await orderIn(db, "Two Admins", "approved");
    await open(page, order);
    // The other admin moved it on meanwhile.
    await db`update orders set status = 'in_preparation', version = version + 1 where id = ${order.id}`;

    await page.getByRole("button", { name: "Mark in preparation" }).click();

    const alert = page.getByRole("alert");
    await expect(alert).toContainText("This order changed. Reload");
    await expect(alert).toBeFocused();
    // S-126 AC5: the conflict state is axe clean too.
    await expectNoA11yViolations(page);
    // The optimistic status went back to what the page knew.
    await expect(page.getByTestId("order-status")).toHaveText("Approved");
    const reload = alert.getByRole("link", { name: "Reload the order" });
    expect((await reload.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await reload.click();
    await expect(page.getByTestId("order-status")).toHaveText("In preparation");
    await expect(page.getByRole("button", { name: "Mark ready for pickup" })).toBeVisible();
  });
});

test.describe("S-113 detail and S-114 note", () => {
  test("S-113 AC1, AC2, AC4, AC9: contact buttons have distinct names; Maps for delivery; WhatsApp prefilled", async ({ page, db }) => {
    const order = await orderIn(db, "Marie", "approved", { delivery: true });
    await open(page, order);

    await expect(page.getByRole("link", { name: "Call Marie" })).toHaveAttribute("href", /^tel:\+2305\d{7}$/);
    // E-10 S-203: WhatsApp opens a menu of prefilled template messages.
    await page.getByRole("button", { name: "WhatsApp Marie" }).click();
    await expect(page.getByRole("menuitem").first()).toHaveAttribute("href", new RegExp(`^https://wa\\.me/2305\\d{7}\\?text=.*${orderNumber(order.number)}`));
    await page.keyboard.press("Escape");
    await expect(page.getByRole("link", { name: "Open Marie's address in Maps" })).toHaveAttribute("href", /maps\/search\/\?api=1&query=12%20Royal%20Road/);
    await expect(page.getByText("Blue gate")).toBeVisible();
    await expect(page.getByText("Unpaid", { exact: true })).toBeVisible();
    if (isPhone375()) await page.screenshot({ path: `${SHOTS}/orders-detail.png` });
  });

  test("S-113 AC3: without a usable phone, Call and WhatsApp are disabled with a hint", async ({ page, db }) => {
    const order = await orderIn(db, "No Phone", "approved");
    await db`update orders set contact_phone = '' where id = ${order.id}`;
    await open(page, order);

    await expect(page.getByRole("link", { name: "Call No Phone" })).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByRole("button", { name: "WhatsApp No Phone" })).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByText("No usable phone number on this order")).toBeVisible();
  });

  test("S-114 AC1, AC3, AC7: the note saves 1 s after typing and says Saved; too long keeps the text with an error", async ({ page, db }) => {
    const order = await orderIn(db, "Note Taker", "approved");
    await open(page, order);

    const note = page.getByRole("textbox", { name: "Private note" });
    await note.fill("Allergic to nuts, call before delivery");
    await expect(page.getByTestId("note-status")).toHaveText("Saved");
    const [row] = await db<{ admin_note: string; version: number }[]>`select admin_note, version from orders where id = ${order.id}`;
    expect(row).toEqual({ admin_note: "Allergic to nuts, call before delivery", version: 1 });

    const long = "x".repeat(2001);
    await note.fill(long);
    await expect(page.getByText("The note is too long: 2000 characters at most. Your text is kept.")).toBeVisible();
    await expect(note).toHaveValue(long);
  });
});

test.describe("S-126 layout and accessibility of the detail", () => {
  test("AC1: at 375x667 the action bar and the bottom navigation take at most 128 px; the primary action is in the bottom half", async ({ page, db }) => {
    test.skip(test.info().project.name !== "phone-375", "The budget is for the 375x667 phone");
    const order = await orderIn(db, "Bar Budget", "approved");
    await open(page, order);

    const bar = (await page.locator("[data-sticky-bar]").boundingBox())!;
    const nav = (await page.locator("[data-bottom-bar]").boundingBox())!;
    expect(bar.height + nav.height).toBeLessThanOrEqual(128);
    const primary = (await page.getByRole("button", { name: "Mark in preparation" }).boundingBox())!;
    expect(primary.y).toBeGreaterThan(667 / 2);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`keyboard, 200% zoom, 44 px targets, no clipping, axe clean (${colorScheme}), sheet included`, async ({ page, db }) => {
      const order = await orderIn(db, `Layout ${colorScheme}`, "in_preparation", { delivery: true });
      await page.emulateMedia({ colorScheme });
      await open(page, order);
      for (const zoom of [1, 2]) {
        await withZoom(page, zoom, async () => {
          await expectNoHorizontalScroll(page);
          await expectNothingClipped(page);
          await expectTapTargets(page);
          await expectFormKeyboardOperable(page);
        });
      }
      await expectNoA11yViolations(page);
      await page.getByRole("button", { name: "More actions" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectNoA11yViolations(page);
      await expectTapTargets(page);
    });
  }
});
