// E-09 Sales summary on a phone and a desktop (S-171..S-173, S-178): figures for a custom
// period, period tabs by keyboard, the unpaid row opening the E-06 order detail, CSV export
// with its busy state and failure toast, accessibility at 320/375/1280 px and 200% zoom, EN/FR.
// Each project uses its own far-future months so parallel runs never share figures.
import type postgres from "postgres";
import {
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  expectNothingClipped,
  expectTapTargets,
  tabThrough,
} from "./support/a11y";
import { signIn } from "./support/admin";
import type { E2eAccount } from "./support/auth-users";
import { E2E_ACCOUNTS, createOrder } from "./support/database";
import { type Page, expect, test } from "./support/fixtures";

const SHOTS = "/tmp/claude-0/-home-user-auxpetitsbonheurs/9106cb54-2393-55df-a3cb-bd8500903b6a/scratchpad";
const PROJECTS = ["phone-320", "phone-375", "desktop-1280"];
const isPhone375 = () => test.info().project.name === "phone-375";

/** A month of its own for this project and test (2041..2043), as a custom range query. */
function monthFor(month: number): { from: string; to: string; query: string } {
  const year = 2041 + Math.max(0, PROJECTS.indexOf(test.info().project.name));
  const mm = String(month).padStart(2, "0");
  const from = `${year}-${mm}-01`;
  const to = `${year}-${mm}-28`;
  return { from, to, query: `range=custom&from=${from}&to=${to}` };
}

async function orderOn(db: postgres.Sql, label: string, values: { date: string; status: string; totalRs: number; paid?: boolean; delivery?: boolean }) {
  const order = await createOrder(db, label);
  await db`update orders set status = ${values.status}::order_status, fulfil_on = ${values.date}, total_rs = ${values.totalRs},
    items_total_rs = ${values.totalRs}, paid = ${values.paid ?? false}, paid_at = ${values.paid ? new Date() : null} where id = ${order.id}`;
  if (values.delivery) await db`update orders set fulfilment = 'delivery', address = '12 Royal Road, Rose Hill' where id = ${order.id}`;
  return order;
}

async function seedMonth(db: postgres.Sql, month: number) {
  const range = monthFor(month);
  const day = `${range.from.slice(0, 8)}12`;
  await orderOn(db, "Done One", { date: day, status: "completed", totalRs: 1000, paid: true });
  await orderOn(db, "Done Two", { date: day, status: "completed", totalRs: 2500, paid: true, delivery: true });
  const unpaid = await orderOn(db, "Hélène Unpaid", { date: day, status: "approved", totalRs: 3000 });
  await orderOn(db, "Gone Away", { date: day, status: "cancelled", totalRs: 9000 });
  return { range, unpaid };
}

async function open(page: Page, path: string, account: E2eAccount = E2E_ACCOUNTS.owner) {
  await signIn(page, account, path);
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
}

test.describe("S-171..S-173 figures", () => {
  test("revenue, orders and average for a custom period; breakdowns; the unpaid row opens the order", async ({ page, db }) => {
    const { range, unpaid } = await seedMonth(db, 1);
    await open(page, `/admin/sales?${range.query}`);

    const tiles = page.getByRole("definition");
    await expect(tiles.nth(0)).toHaveText("Rs 3,500");
    await expect(tiles.nth(1)).toHaveText("2");
    await expect(tiles.nth(2)).toHaveText("Rs 1,750");
    await expect(page.getByText("Revenue counts Completed orders by order date.")).toBeVisible();
    await expect(page.getByRole("list").filter({ hasText: "Delivery" })).toContainText("1 order · Rs 2,500");
    await expect(page.getByText("Unpaid total:")).toBeVisible();
    if (isPhone375()) await page.screenshot({ path: `${SHOTS}/sales-summary.png`, fullPage: true });

    const row = page.getByRole("link", { name: new RegExp(`^APB-\\d{4}, Hélène Unpaid, Rs 3,000$`) });
    await row.click();
    await expect(page).toHaveURL(`/admin/orders/${unpaid.id}`);
  });

  test("an invalid custom period says so inline and shows no figures", async ({ page }) => {
    await open(page, "/admin/sales?range=custom&from=2041-03-10&to=2041-03-01");
    await expect(page.getByRole("alert")).toHaveText("The start date must be on or before the end date.");
    await expect(page.getByText("Revenue counts Completed orders")).toHaveCount(0);
    await expect(page.getByLabel("From")).toHaveAttribute("aria-invalid", "true");
  });

  test("S-171 AC12: period tabs are a tablist with arrow keys; Enter opens the focused period", async ({ page }) => {
    await open(page, "/admin/sales");
    const tabs = page.getByRole("tab");
    await expect(tabs).toHaveCount(4);
    await expect(page.getByRole("tab", { name: "This month" })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "This month" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Last month" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/range=last_month/);
    await expect(page.getByRole("tab", { name: "Last month" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel")).toBeVisible();
  });

  test("an Admin sees it too, in French (S-171 AC10, AC11)", async ({ page, db }) => {
    const { range } = await seedMonth(db, 2);
    await open(page, `/admin/sales?${range.query}`, E2E_ACCOUNTS.french);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Résumé des ventes");
    await expect(page.getByText("Chiffre d’affaires", { exact: true })).toBeVisible();
    await expect(page.getByText(/^Période : \d+–28 février 20\d\d$/)).toBeVisible();
    await expect(page.getByText("Site web")).toBeVisible();
    await expectNoA11yViolations(page);
  });
});

test.describe("S-178 export", () => {
  test("AC1, AC9: Export CSV downloads the file named after the range", async ({ page, db }) => {
    const { range } = await seedMonth(db, 3);
    await open(page, `/admin/sales?${range.query}`);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(`apb-sales-${range.from}_${range.to}.csv`);
    await expect(page.getByText("CSV downloaded.")).toBeVisible();
  });

  test("AC5: a failed export shows the toast and the button leaves its busy state", async ({ page }) => {
    await open(page, "/admin/sales");
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/admin/sales.csv*", async (route) => {
      await held;
      await route.fulfill({ status: 500, body: "boom" });
    });
    const button = page.getByRole("button", { name: /Export CSV|Preparing the CSV/ });
    await button.click();
    await expect(button).toHaveAttribute("aria-busy", "true");
    await expect(button).toHaveText("Preparing the CSV…");
    release();
    await expect(page.getByText("Export failed, try again")).toBeVisible();
    await expect(button).not.toHaveAttribute("aria-busy");
    await expect(button).toHaveText("Export CSV");
    if (isPhone375()) await page.screenshot({ path: `${SHOTS}/sales-export-failed.png` });
  });
});

test.describe("accessibility (S-171 AC12, AC13; S-172 AC7, AC8; S-173 AC8; S-178 AC9)", () => {
  test("axe, tap targets, keyboard, no sideways scroll, 200% zoom", async ({ page, db }) => {
    const { range } = await seedMonth(db, 4);
    await open(page, `/admin/sales?${range.query}`);
    await expectNoA11yViolations(page);
    await expectTapTargets(page);
    await expectNoHorizontalScroll(page);
    await expectNothingClipped(page);
    // Tabs pattern: only the selected tab is a Tab stop (arrows move between tabs); every other
    // control is reached in page order with a visible focus ring.
    // The bottom bar leaves phones while a text field has focus (S-033 AC5): pinned so stops keep their numbers.
    const pin = await page.addStyleTag({ content: "[data-bottom-bar] { display: block !important; }" });
    const { stops, total } = await tabThrough(page, 80);
    await pin.evaluate((style) => (style as Element).remove());
    const indexes = stops.map((s) => s.index);
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
    expect(total - stops.length).toBe(3);
    for (const name of ["This week", "This month", "Last month"]) expect(stops.map((s) => s.name)).not.toContain(name);
    expect(stops.filter((s) => !s.visibleFocus).map((s) => s.name)).toEqual([]);
    await expectNoA11yViolations(page, { zoom: 2 });
  });
});
