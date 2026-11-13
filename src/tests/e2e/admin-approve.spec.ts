// S-017 orders to review and Approve from the phone, through the real sign-in (local
// GoTrue stub) and the local Postgres.
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

async function pendingOrder(db: Parameters<typeof createOrder>[0], label: string): Promise<TestOrder> {
  const order = await createOrder(db, label);
  await db`update orders set contact_email = ${`${label.toLowerCase().replace(/\W+/g, "-")}@e2e.test`} where id = ${order.id}`;
  return order;
}

async function accessibleLayout(page: Page) {
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
  for (const zoom of [1, 2]) {
    await withZoom(page, zoom, async () => {
      await expectNoHorizontalScroll(page);
      await expectNothingClipped(page);
      await expectTapTargets(page);
      await expectFormKeyboardOperable(page);
    });
  }
}

test.describe("S-017 orders to review and Approve", () => {
  test("AC1: a pending order is listed with number, name, date, window, total and source; later pages by cursor", async ({ page, db }) => {
    const order = await pendingOrder(db, `List ${test.info().project.name}`);
    await signIn(page, E2E_ACCOUNTS.owner, "/admin/orders?tab=review");

    await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible();
    // Other specs add orders to the same database: find this one by its number (E-06 search; paging is in admin-orders-list.spec).
    await page.getByRole("searchbox", { name: "Search orders" }).fill(orderNumber(order.number));
    await page.getByRole("button", { name: "Search" }).click();
    const link = page.getByRole("link", { name: new RegExp(`^${orderNumber(order.number)}, List ${test.info().project.name}, Fri 20 Nov, Pending approval, unpaid$`) });
    const card = page.getByRole("listitem").filter({ has: link });
    await expect(card).toContainText(`List ${test.info().project.name}`);
    await expect(card).toContainText("Fri 20 Nov");
    await expect(card).toContainText("Morning · 09:00–12:00");
    await expect(card).toContainText("Rs 850");
    await expect(card).toContainText("Website");
    await expect(card).toContainText("Pending approval");
  });

  test("AC2, AC3, AC9: the detail shows the order; Approve shows a loading state, announces the result, and records it", async ({ page, db }) => {
    const order = await pendingOrder(db, "Approve Me");
    await signIn(page, E2E_ACCOUNTS.helper, `/admin/orders/${order.id}`);

    await expect(page.getByRole("heading", { level: 1, name: `Order ${orderNumber(order.number)}` })).toBeVisible();
    await expect(page.getByText("Pending approval", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Call Approve Me" })).toHaveAttribute("href", /^tel:\+2305\d{7}$/);
    await expect(page.getByText("approve-me@e2e.test")).toBeVisible();
    await expect(page.getByText("Fri 20 Nov")).toBeVisible();
    await expect(page.getByText("Pickup", { exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");

    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(`**/admin/orders/${order.id}*`, async (route) => {
      if (route.request().method() === "POST") await held;
      await route.continue();
    });
    const approve = page.getByRole("button", { name: `Approve ${orderNumber(order.number)}` });
    await approve.click();
    await expect(approve).toHaveAttribute("aria-busy", "true");
    await expect(approve).toBeFocused();
    // Optimistic (E-06): the header shows the expected status before the server answers.
    await expect(page.getByTestId("order-status")).toHaveText("Approved");
    release();

    await expect(page.getByRole("status").filter({ hasText: `Order ${orderNumber(order.number)} approved.` })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Approve/ })).toHaveCount(0);
    // The focused button is gone: focus lands on the result, not on <body>; the next step is offered.
    await expect(page.getByTestId("approve-result")).toBeFocused();
    await expect(page.getByRole("button", { name: "Mark in preparation" })).toBeVisible();
    const [row] = await db<{ status: string; version: number }[]>`select status, version from orders where id = ${order.id}`;
    expect(row).toEqual({ status: "approved", version: 2 });
    const events = await db`select actor_admin_id from order_event where order_id = ${order.id} and type = 'approved'`;
    expect(events).toEqual([{ actor_admin_id: E2E_ACCOUNTS.helper.id }]);
    const outbox = await db`select dedupe_key from email_outbox where order_id = ${order.id} and template = 'order_confirmed'`;
    expect(outbox).toEqual([{ dedupe_key: `order:${order.id}:order_confirmed:v2` }]);
  });

  test("AC4: when someone else changed the order, Approve says \"This order changed. Reload\" and nothing changes", async ({ page, db }) => {
    const order = await pendingOrder(db, "Changed Meanwhile");
    await signIn(page, E2E_ACCOUNTS.owner, `/admin/orders/${order.id}`);
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
    await db`update orders set version = version + 1 where id = ${order.id}`;

    await page.getByRole("button", { name: "Approve" }).click();

    const alert = page.getByRole("alert");
    await expect(alert).toContainText("This order changed. Reload");
    await expect(alert).toBeFocused();
    const [row] = await db<{ status: string }[]>`select status from orders where id = ${order.id}`;
    expect(row!.status).toBe("pending_approval");
    await alert.getByRole("link", { name: "Reload the order" }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Approve" })).toBeVisible();
  });

  test("AC5, AC6: two simultaneous approvals against Postgres make one change and one outbox row; a repeat is refused", async ({ page, db, baseURL }) => {
    const order = await pendingOrder(db, "Raced Twice");
    await signIn(page, E2E_ACCOUNTS.owner);
    const post = (version: string) =>
      page.request.post(`/admin/orders/${order.id}`, { form: { intent: "approve", version }, headers: { Origin: baseURL! }, maxRedirects: 0 });

    const statuses = (await Promise.all([post("1"), post("1")])).map((r) => r.status()).sort();

    expect(statuses).toEqual([200, 409]);
    expect(await db`select id from email_outbox where order_id = ${order.id} and template = 'order_confirmed'`).toHaveLength(1);
    expect(await db`select id from order_event where order_id = ${order.id} and type = 'approved'`).toHaveLength(1);
    expect((await post("2")).status()).toBe(409);
    const [row] = await db<{ version: number }[]>`select version from orders where id = ${order.id}`;
    expect(row!.version).toBe(2);
    await page.goto(`/admin/orders/${order.id}`);
    await expect(page.getByRole("button", { name: /^Approve/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Mark in preparation" })).toBeVisible();
  });

  test("AC7: signed out or as a customer, the orders pages and approve lead to login with no order data", async ({ page, db, request, baseURL }) => {
    const order = await pendingOrder(db, "Not For Customers");
    for (const path of ["/admin/orders?tab=review", `/admin/orders/${order.id}`]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status()).toBe(302);
      expect(response.headers().location).toBe(`/admin/login?next=${encodeURIComponent(path)}`);
    }
    const posted = await request.post(`/admin/orders/${order.id}`, { form: { intent: "approve", version: "1" }, headers: { Origin: baseURL! }, maxRedirects: 0 });
    expect(posted.status()).toBe(302);
    expect(await posted.text()).not.toContain("Not For Customers");

    await page.goto("/admin/login");
    await page.getByLabel("Email", { exact: true }).fill(E2E_ACCOUNTS.customer.email);
    await page.getByLabel("Password", { exact: true }).fill(E2E_ACCOUNTS.customer.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.goto(`/admin/orders/${order.id}`);
    await expect(page).toHaveURL(/\/admin\/login\?next=/);
    const [row] = await db<{ status: string }[]>`select status from orders where id = ${order.id}`;
    expect(row!.status).toBe("pending_approval");
  });

  test("AC8: list and detail work by keyboard, at 200% zoom, with no clipping and 44 px targets; Approve sits within thumb reach", async ({ page, db }) => {
    const order = await pendingOrder(db, "Layout Check");
    await signIn(page, E2E_ACCOUNTS.owner, "/admin/orders?tab=review");
    await accessibleLayout(page);

    await page.goto(`/admin/orders/${order.id}`);
    await accessibleLayout(page);
    const viewport = page.viewportSize()!;
    const box = (await page.getByRole("button", { name: "Approve" }).boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    expect(box.y).toBeGreaterThan(viewport.height / 2);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`AC9: axe clean in ${colorScheme} mode on the list and on the detail before and after Approve`, async ({ page, db }) => {
      const order = await pendingOrder(db, `Axe ${colorScheme}`);
      await page.emulateMedia({ colorScheme });
      await signIn(page, E2E_ACCOUNTS.owner, "/admin/orders?tab=review");
      await expectNoA11yViolations(page);
      await page.goto(`/admin/orders/${order.id}`);
      await expectNoA11yViolations(page);
      await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
      await page.getByRole("button", { name: "Approve" }).click();
      await expect(page.getByRole("status").filter({ hasText: "approved." })).toBeVisible();
      await expectNoA11yViolations(page, { zoom: 2 });
    });
  }
});

test.describe("S-018 order activity log", () => {
  test("AC7: the log is a labelled list, oldest first, not clipped at 100% and 200% zoom, and axe clean", async ({ page, db }) => {
    const order = await pendingOrder(db, "Logged Order");
    await db`insert into order_event (order_id, actor_type, type, to_status) values (${order.id}, 'customer', 'created', 'pending_approval')`;
    await signIn(page, E2E_ACCOUNTS.helper, `/admin/orders/${order.id}`);
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByRole("status").filter({ hasText: "approved." })).toBeVisible();

    const log = page.getByRole("list", { name: "Activity" });
    await expect(log.getByRole("listitem")).toHaveText([/^Created by customer, /, /^Approved by Sarah, \d{1,2} [A-Z][a-z]{2} \d{2}:\d{2}$/]);
    for (const zoom of [1, 2]) {
      await withZoom(page, zoom, async () => {
        await expectNoHorizontalScroll(page);
        await expectNothingClipped(page);
      });
    }
    await expectNoA11yViolations(page);
    await expectNoA11yViolations(page, { zoom: 2 });
  });

  test("AC2: a French admin reads the log in French, in Mauritius time", async ({ page, db }) => {
    const order = await pendingOrder(db, "Commande Française");
    await db`insert into order_event (order_id, actor_type, type, to_status, created_at) values (${order.id}, 'customer', 'created', 'pending_approval', '2026-11-12T10:05:00Z')`;
    await signIn(page, E2E_ACCOUNTS.french, `/admin/orders/${order.id}`);

    await expect(page.getByRole("list", { name: "Historique" }).getByRole("listitem")).toHaveText(["Créée par le client, 12 Nov 14:05"]);
  });
});
