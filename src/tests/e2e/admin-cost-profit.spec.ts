// S-318 "Cost to make" and profit, on a phone and a desktop: an Admin enters a cost on an order
// (inline, "Saved", Activity line, calm error), the Cost to run of a workshop event, and the
// Sales summary's earned / spent / profit with the "no cost yet" note and its list. Axe, 44 px
// targets, no sideways scroll and 200% zoom at 320/375/1280 px, EN and FR.
// Each project uses its own far-future months (2061..2063) so parallel runs never share figures.
import { randomInt } from "node:crypto";
import type postgres from "postgres";
import { expectNoA11yViolations, expectNoHorizontalScroll, expectNothingClipped, expectTapTargets } from "./support/a11y";
import { signIn } from "./support/admin";
import type { E2eAccount } from "./support/auth-users";
import { E2E_ACCOUNTS, createOrder } from "./support/database";
import { type Page, expect, test } from "./support/fixtures";

const SHOTS = "/tmp/claude-0/-home-user-auxpetitsbonheurs/9106cb54-2393-55df-a3cb-bd8500903b6a/scratchpad";
const PROJECTS = ["phone-320", "phone-375", "desktop-1280"];
const isPhone375 = () => test.info().project.name === "phone-375";

function monthFor(month: number): { from: string; to: string; day: string; query: string } {
  const year = 2061 + Math.max(0, PROJECTS.indexOf(test.info().project.name));
  const mm = String(month).padStart(2, "0");
  const from = `${year}-${mm}-01`;
  const to = `${year}-${mm}-28`;
  return { from, to, day: `${year}-${mm}-12`, query: `range=custom&from=${from}&to=${to}` };
}

async function completed(db: postgres.Sql, label: string, values: { date: string; totalRs: number; costRs?: number | null; status?: string }) {
  const order = await createOrder(db, label);
  await db`update orders set status = ${values.status ?? "completed"}::order_status, fulfil_on = ${values.date}, total_rs = ${values.totalRs},
    items_total_rs = ${values.totalRs}, paid = true, paid_at = now(), cost_rs = ${values.costRs ?? null} where id = ${order.id}`;
  return order;
}

async function workshop(db: postgres.Sql, date: string, costRs: number | null, title = "Valentine's cakes") {
  const slug = `cost-${randomInt(1e9)}`;
  const [event] = await db<{ id: string }[]>`insert into workshop_event (slug, title_en, title_fr, event_on, starts_at, ends_at, address, price_rs, capacity, cake_options, status, cost_rs)
    values (${slug}, ${title}, 'Atelier gâteaux', ${date}, '14:00', '16:30', '12 Rue Example', 1500, 4, ${db.json([{ id: "choc", name: { en: "Chocolate" } }])}, 'completed', ${costRs})
    returning id`;
  return event!.id;
}

async function open(page: Page, path: string, account: E2eAccount = E2E_ACCOUNTS.helper) {
  await signIn(page, account, path);
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
}

async function checkA11y(page: Page) {
  await expectNoA11yViolations(page);
  await expectTapTargets(page);
  await expectNoHorizontalScroll(page);
  await expectNothingClipped(page);
  await expectNoA11yViolations(page, { zoom: 2 });
}

test.describe("Cost to make on an order (S-318 AC1-AC4)", () => {
  test("an Admin enters a cost on a completed order: Saved, the order's profit, kept after reload, logged in Activity", async ({ page, db }) => {
    const { day } = monthFor(1);
    const order = await completed(db, "Cost Person", { date: day, totalRs: 2000 });
    await open(page, `/admin/orders/${order.id}`);

    const field = page.getByLabel("Cost in rupees");
    await expect(page.getByRole("heading", { name: "Cost to make" })).toBeVisible();
    await field.fill("1250");
    await page.getByRole("button", { name: "Save cost" }).click();
    await expect(page.getByTestId("order-cost-status")).toHaveText("Saved");
    await expect(page.getByText("Profit on this order: Rs 750")).toBeVisible();
    await expect(field).toHaveValue("1,250");
    if (isPhone375()) {
      await page.getByRole("heading", { name: "Cost to make" }).evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 16));
      await page.screenshot({ path: `${SHOTS}/s318-order-cost.png` });
    }

    await page.reload();
    await expect(page.getByLabel("Cost in rupees")).toHaveValue("1,250");
    await expect(page.getByText(/^Cost to make changed by Sarah, /)).toBeVisible();
    await expect(page.getByText("Cost: none → Rs 1,250")).toBeVisible();
    await checkA11y(page);
  });

  test("a wrong amount is refused at once, calmly, and the order's actions stay usable", async ({ page, db }) => {
    const order = await completed(db, "Typo Person", { date: monthFor(2).day, totalRs: 900, status: "approved" });
    await open(page, `/admin/orders/${order.id}`);
    const field = page.getByLabel("Cost in rupees");
    await field.fill("12.50");
    await field.press("Enter");
    await expect(page.getByText("Enter whole rupees from 0 to 1,000,000, or leave it empty.")).toBeVisible();
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(field).toHaveValue("12.50");
    const [row] = await db<{ cost_rs: number | null }[]>`select cost_rs from orders where id = ${order.id}`;
    expect(row!.cost_rs).toBeNull();
    await field.fill("");
    await field.blur();
    await expect(field).not.toHaveAttribute("aria-invalid", "true");
  });

  test("French: Coût de fabrication, Enregistré", async ({ page, db }) => {
    const order = await completed(db, "Personne Coût", { date: monthFor(3).day, totalRs: 1500 });
    await open(page, `/admin/orders/${order.id}`, E2E_ACCOUNTS.french);
    await expect(page.getByRole("heading", { name: "Coût de fabrication" })).toBeVisible();
    await page.getByLabel("Coût en roupies").fill("500");
    await page.getByRole("button", { name: "Enregistrer le coût" }).click();
    await expect(page.getByTestId("order-cost-status")).toHaveText("Enregistré");
    await expectNoA11yViolations(page);
  });
});

test.describe("Cost to run on a workshop (S-318 AC8)", () => {
  test("an Admin sets the cost of a completed event", async ({ page, db }) => {
    const id = await workshop(db, monthFor(4).day, null);
    await open(page, `/admin/workshops/${id}`);
    await expect(page.getByRole("heading", { name: "Cost to run" })).toBeVisible();
    await page.getByLabel("Cost in rupees").fill("4 500");
    await page.getByRole("button", { name: "Save cost" }).click();
    await expect(page.getByTestId("event-cost-status")).toHaveText("Saved");
    const [row] = await db<{ cost_rs: number | null }[]>`select cost_rs from workshop_event where id = ${id}`;
    expect(row!.cost_rs).toBe(4500);
    await expectNoA11yViolations(page);
    await expectTapTargets(page);
  });
});

test.describe("Sales: amount earned, spent and profit (S-318 AC5-AC7)", () => {
  test("figures, the calm missing-cost note with its list, the workshop line; a11y", async ({ page, db }) => {
    const { day, query } = monthFor(5);
    await completed(db, "Paid Cost", { date: day, totalRs: 3000, costRs: 1200 });
    const missing = await completed(db, "No Cost Yet", { date: day, totalRs: 1000 });
    await completed(db, "Refused One", { date: day, totalRs: 5000, costRs: 900, status: "declined" });
    await workshop(db, day, 800);
    await open(page, `/admin/sales?${query}`);

    const profit = page.getByRole("region", { name: "Profit" });
    await expect(profit.getByRole("definition").nth(0)).toHaveText("Rs 4,000");
    await expect(profit.getByRole("definition").nth(1)).toHaveText("Rs 2,000");
    await expect(profit.getByRole("definition").nth(2)).toHaveText("Rs 2,000");
    await expect(profit.getByText("1 order counted here has no cost yet, so the profit may look higher than it is.")).toBeVisible();
    await expect(profit.getByRole("link", { name: "Valentine's cakes" })).toBeVisible();
    if (isPhone375()) {
      await profit.scrollIntoViewIfNeeded();
      await profit.screenshot({ path: `${SHOTS}/s318-sales-profit.png` });
    }
    await checkA11y(page);

    await profit.getByText("Show the order").click();
    await profit.getByRole("link", { name: /No Cost Yet, Rs 1,000$/ }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/orders/${missing.id}#cost-heading$`));
    await expect(page.getByLabel("Cost in rupees")).toBeVisible();
  });

  test("French, and a loss shows with a minus sign", async ({ page, db }) => {
    const { day, query } = monthFor(6);
    await completed(db, "Perte", { date: day, totalRs: 500, costRs: 700 });
    await open(page, `/admin/sales?${query}`, E2E_ACCOUNTS.french);
    const profit = page.getByRole("region", { name: "Bénéfice" });
    await expect(profit.getByText("Montant gagné", { exact: true })).toBeVisible();
    await expect(profit.getByRole("definition").nth(2)).toHaveText("-Rs 200");
    await expect(profit.getByText("Chaque commande et chaque atelier de la période a un coût.")).toBeVisible();
    await expectNoA11yViolations(page);
  });
});
