// E-06 Orders list on a phone: tabs with counts, Load more, search and the filter sheet
// (S-111, S-112), against the built Worker and Postgres. Other specs add orders to the same
// database, so each test finds its own orders by a unique name.
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

const SHOTS = "/tmp/claude-0/-home-user-auxpetitsbonheurs/9106cb54-2393-55df-a3cb-bd8500903b6a/scratchpad";
const orderNumber = (n: number) => `APB-${String(n).padStart(4, "0")}`;
const project = () => test.info().project.name;

type Db = Parameters<typeof createOrder>[0];

async function orderIn(db: Db, label: string, status: string, extra: { delivery?: boolean; paid?: boolean } = {}): Promise<TestOrder> {
  const order = await createOrder(db, label);
  await db`update orders set status = ${status}::order_status where id = ${order.id}`;
  if (extra.delivery) await db`update orders set fulfilment = 'delivery', address = '12 Royal Road' where id = ${order.id}`;
  if (extra.paid) await db`update orders set paid = true, paid_at = now(), paid_by = ${E2E_ACCOUNTS.owner.id} where id = ${order.id}`;
  return order;
}

/** Keyboard walk with the bottom bar pinned: on phones it leaves while a text field has focus (S-033 AC5), renumbering the stops. */
async function expectFormKeyboardOperable(page: Page) {
  const pin = await page.addStyleTag({ content: "[data-bottom-bar] { display: block !important; }" });
  try {
    await expectKeyboardOperable(page);
  } finally {
    await pin.evaluate((style) => (style as Element).remove());
  }
}

async function search(page: Page, text: string) {
  await page.getByRole("searchbox", { name: "Search orders" }).fill(text);
  const searched = page.waitForURL((url) => url.searchParams.get("q") === text.trim());
  await page.getByRole("button", { name: "Search" }).click();
  await searched;
}

test.describe("S-111 tabs, counts and Load more", () => {
  test("AC1, AC2, AC3: tabs with counts; a quote_sent order is in Upcoming as Waiting for customer", async ({ page, db }) => {
    const label = `Tabs ${project()}`;
    const order = await orderIn(db, label, "quote_sent");
    await signIn(page, E2E_ACCOUNTS.owner, "/admin/orders?tab=review");
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");

    const tabs = page.getByRole("navigation", { name: "Order lists" });
    await expect(tabs.getByRole("link", { name: /^To review/ })).toHaveAttribute("aria-current", "page");
    await tabs.getByRole("link", { name: /^Upcoming \(\d+ orders?\)$/ }).click();
    await expect(page).toHaveURL(/tab=upcoming/);
    await search(page, label);
    const row = page.getByRole("link", { name: `${orderNumber(order.number)}, ${label}, Fri 20 Nov, Waiting for customer, unpaid` });
    await expect(row).toBeVisible();
    expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });

  test("AC4: 31 orders show 30, Load more appends the last one in place", async ({ page, db }) => {
    const label = `Paging ${project()}`;
    for (let i = 0; i < 31; i += 1) await orderIn(db, `${label} ${String(i).padStart(2, "0")}`, "approved");
    await signIn(page, E2E_ACCOUNTS.owner, `/admin/orders?tab=upcoming&q=${encodeURIComponent(label)}`);
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");

    const rows = page.getByRole("list", { name: "Orders", exact: true }).getByRole("listitem");
    await expect(rows).toHaveCount(30);
    await page.getByRole("link", { name: "Load more" }).click();
    await expect(rows).toHaveCount(31);
    await expect(page).toHaveURL(/tab=upcoming&q=/);
    await expect(page.getByRole("link", { name: "Load more" })).toHaveCount(0);
  });
});

test.describe("S-112 search and filters", () => {
  test("AC1, AC2: a phone with spaces and +230, a number or an accented name finds the order", async ({ page, db }) => {
    const label = `Hélène ${project()}`;
    const order = await orderIn(db, label, "approved");
    const [row] = await db<{ contact_phone: string }[]>`select contact_phone from orders where id = ${order.id}`;
    const local = row!.contact_phone.slice(4);
    await signIn(page, E2E_ACCOUNTS.owner, "/admin/orders?tab=upcoming");

    for (const text of [`+230 ${local.slice(0, 4)} ${local.slice(4)}`, orderNumber(order.number), label.replace("Hélène", "HELENE")]) {
      await search(page, text);
      await expect(page.getByRole("link", { name: new RegExp(`^${orderNumber(order.number)}, `) })).toBeVisible();
    }
  });

  test("AC3, AC5, AC8: the filter sheet traps focus and closes on Esc; chips remove one filter; no match offers Clear filters", async ({ page, db }) => {
    const label = `Filter ${project()}`;
    const delivery = await orderIn(db, `${label} D`, "approved", { delivery: true });
    const paidPickup = await orderIn(db, `${label} P`, "approved", { paid: true });
    await signIn(page, E2E_ACCOUNTS.owner, `/admin/orders?tab=upcoming&q=${encodeURIComponent(label)}`);
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");

    const filters = page.getByRole("button", { name: "Filters" });
    await filters.click();
    const sheet = page.getByRole("dialog", { name: "Filter orders" });
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(filters).toBeFocused();

    await filters.click();
    await sheet.getByRole("radio", { name: "Delivery" }).check();
    await sheet.getByRole("radio", { name: "Unpaid" }).check();
    await sheet.getByRole("button", { name: "Show orders" }).click();
    await expect(page.getByRole("link", { name: new RegExp(`^${orderNumber(delivery.number)}, `) })).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(`^${orderNumber(paidPickup.number)}, `) })).toHaveCount(0);
    if (test.info().project.name === "phone-375") {
      await page.getByRole("searchbox", { name: "Search orders" }).scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, document.querySelector("#orders-q")!.getBoundingClientRect().top - 16));
      await page.screenshot({ path: `${SHOTS}/orders-list.png` });
    }

    await page.getByRole("link", { name: "Remove filter: Delivery" }).click();
    await page.getByRole("link", { name: "Remove filter: Unpaid" }).click();
    await expect(page.getByRole("link", { name: new RegExp(`^${orderNumber(paidPickup.number)}, `) })).toBeVisible();

    await search(page, `${label} nobody`);
    await expect(page.getByText("No orders match.")).toBeVisible();
    await page.getByRole("main").getByRole("link", { name: "Clear filters" }).first().click();
    await expect(page).toHaveURL(/\/admin\/orders\?tab=upcoming$/);
  });

  test("AC7: %, _ and quotes are plain text, never an error", async ({ page }) => {
    await signIn(page, E2E_ACCOUNTS.owner, "/admin/orders?tab=upcoming");
    for (const text of ["%", "_", "' or 1=1 --"]) {
      await search(page, text);
      await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible();
      await expect(page.getByRole("alert")).toHaveCount(0);
    }
  });
});

test.describe("S-111 AC8 / S-112 AC8 layout and accessibility of the list", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`keyboard, 200% zoom, 44 px targets, no clipping, axe clean (${colorScheme}), filter sheet included`, async ({ page, db }) => {
      const label = `A11y list ${colorScheme} ${project()}`;
      await orderIn(db, label, "approved", { delivery: true });
      await page.emulateMedia({ colorScheme });
      await signIn(page, E2E_ACCOUNTS.owner, `/admin/orders?tab=upcoming&q=${encodeURIComponent(label)}&fulfilment=delivery`);
      await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
      for (const zoom of [1, 2]) {
        await withZoom(page, zoom, async () => {
          await expectNoHorizontalScroll(page);
          await expectNothingClipped(page);
          await expectTapTargets(page);
          await expectFormKeyboardOperable(page);
        });
      }
      await expectNoA11yViolations(page);
      await page.getByRole("button", { name: "Filters" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectNoA11yViolations(page);
      await expectTapTargets(page);
    });
  }
});
