// Checkout dates and windows (E-05 S-083, S-084, S-087, S-088) in a real browser at 320, 375
// and 1280 px. Clock: Fri 2026-11-20 08:00 in Mauritius; Settings: notice 3, Sunday closed.
// Each test basket holds its own product (notice and season are per product), so parallel
// workers never share a rule; the one test that blocks a day holds the Settings lock.
import { mkdirSync } from "node:fs";
import {
  expectKeyboardOperable,
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  expectNothingClipped,
  expectTapTargets,
  withZoom,
} from "./support/a11y";
import { createProduct } from "./support/catalogue";
import { chooseDate, spokenDay } from "./support/checkout-date";
import { setClock } from "./support/clock";
import { connectE2eDatabase } from "./support/database";
import { type Page, expect, test } from "./support/fixtures";
import { withSettingsLock } from "./support/settings-lock";

const NOW = "2026-11-20T04:00:00Z";

interface ProductRules {
  noticeDays?: number;
  season?: { startsOn: string; endsOn: string };
}

/** A product of its own with these rules, alone in the basket, and the basket page open and hydrated. */
async function basketWith(page: Page, db: Parameters<typeof createProduct>[0], baseURL: string, rules: ProductRules = {}, path = "/basket") {
  const product = await createProduct(db, { name: "Date cake" });
  await db`update product set notice_days = ${rules.noticeDays ?? null}, seasonal_starts_on = ${rules.season?.startsOn ?? null}, seasonal_ends_on = ${rules.season?.endsOn ?? null} where id = ${product.id}`;
  await setClock(page.context(), baseURL, NOW);
  const line = { lineId: "d1", productId: product.id, options: [], quantity: 1 };
  await page.context().addCookies([{ name: "apb_basket", value: encodeURIComponent(JSON.stringify([line])), url: baseURL, sameSite: "Lax" }]);
  await page.goto(path);
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
  return product;
}

const day = (page: Page, date: string) => page.getByRole("grid").locator(`[data-date="${date}"]`);
/** A tap on a day the grid marks aria-disabled (Playwright would otherwise wait for it to be "enabled"). */
const tap = (page: Page, date: string) => day(page, date).click({ force: true });
const message = (page: Page) => page.locator("[data-date-message]");

test.describe("S-087 date picker", () => {
  test("AC1, AC2, AC3: earliest date from the largest notice; unavailable days are struck through, focusable and say why", async ({ page, db, baseURL }) => {
    await basketWith(page, db, baseURL!, { noticeDays: 5 });

    await expect(page.getByText("Earliest date: Wed 25 Nov")).toBeVisible();
    const tooSoon = day(page, "2026-11-21");
    await expect(tooSoon).toHaveAttribute("aria-disabled", "true");
    await expect(tooSoon).toHaveAttribute("tabindex", "-1");
    await expect(tooSoon.locator("span[aria-hidden]").first()).toHaveCSS("text-decoration-line", "line-through");
    await expect(page.getByRole("gridcell", { name: "Saturday 21 November, not available: Too soon: we need 5 days' notice" })).toBeVisible();

    await tooSoon.click({ force: true });
    await expect(message(page)).toHaveText("Sat 21 Nov: Too soon: we need 5 days' notice");
    await tap(page, "2026-11-29");
    await expect(message(page)).toHaveText("Sun 29 Nov: Closed on Sundays");
    await expect(page.locator('input[name="date"]')).toHaveValue("");

    await day(page, "2026-11-25").click();
    await expect(message(page)).toHaveText("Selected: Wed 25 Nov");
    await expect(page.locator('input[name="date"]')).toHaveValue("2026-11-25");
    await expect(day(page, "2026-11-25")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Fully booked")).toHaveCount(0);
  });

  test("AC8: arrows, Home/End, PageUp/PageDown and Enter; unavailable days stay focusable; month and choice announced", async ({ page, db, baseURL }) => {
    await basketWith(page, db, baseURL!);
    const grid = page.getByRole("grid");
    await expect(grid).toHaveAccessibleName("3. Date November 2026");

    await day(page, "2026-11-23").focus();
    await page.keyboard.press("ArrowLeft"); // Sun 22: closed, still reachable
    await expect(day(page, "2026-11-22")).toBeFocused();
    await expect(message(page)).toHaveText("Sun 22 Nov: Closed on Sundays");
    await page.keyboard.press("ArrowDown");
    await expect(day(page, "2026-11-29")).toBeFocused();
    await page.keyboard.press("Home");
    await expect(day(page, "2026-11-23")).toBeFocused();
    await page.keyboard.press("End");
    await expect(day(page, "2026-11-29")).toBeFocused();
    await page.keyboard.press("PageDown");
    await expect(day(page, "2026-12-29")).toBeFocused();
    await expect(page.locator("#date-month")).toHaveText("December 2026");
    await page.keyboard.press("PageUp");
    await page.keyboard.press("ArrowRight");
    await expect(day(page, "2026-11-30")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator('input[name="date"]')).toHaveValue("2026-11-30");
    await expect(page.getByRole("status").filter({ hasText: "Selected: Monday 30 November" })).toBeAttached();
    // One Tab stop for the whole grid: the chosen day.
    await expect(grid.locator('[tabindex="0"]')).toHaveCount(1);
  });

  test("AC8: 44 px days, no sideways scroll, nothing clipped, keyboard operable, at 100% and 200% zoom", async ({ page, db, baseURL }) => {
    await basketWith(page, db, baseURL!);
    await page.getByRole("radio", { name: /^Pickup/ }).check();
    for (const zoom of [1, 2]) {
      await withZoom(page, zoom, async () => {
        await expect(page.getByRole("grid")).toBeVisible();
        const box = await day(page, "2026-11-24").locator("span[aria-hidden]").first().boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(43.5);
        expect(box!.height).toBeGreaterThanOrEqual(43.5);
        await expectNoHorizontalScroll(page);
        await expectNothingClipped(page);
        await expectTapTargets(page);
        await expectKeyboardOperable(page);
      });
    }
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`AC8, S-088 AC6: axe clean in ${colorScheme} mode with a reason shown and windows listed`, async ({ page, db, baseURL }) => {
      await page.emulateMedia({ colorScheme });
      await basketWith(page, db, baseURL!);
      await page.getByRole("radio", { name: /^Delivery/ }).check();
      await tap(page, "2026-11-21");
      await expect(message(page)).toContainText("Too soon");
      await expectNoA11yViolations(page);
      await expectNoA11yViolations(page, { zoom: 2 });
    });
  }

  test("AC8: French dates fit and read in French", async ({ page, db, baseURL }) => {
    await basketWith(page, db, baseURL!, {}, "/fr/basket");

    await expect(page.getByText("Date la plus proche : lun. 23 nov.")).toBeVisible();
    await tap(page, "2026-11-21");
    await expect(message(page)).toHaveText("sam. 21 nov. : Trop tôt : nous avons besoin de 3 jours de préavis");
    await expectNothingClipped(page);
  });

  test("AC6, S-084: a seasonal item until 25 Dec leaves later days out, naming the item", async ({ page, db, baseURL }) => {
    const product = await basketWith(page, db, baseURL!, { season: { startsOn: "2026-11-01", endsOn: "2026-12-25" } });

    await page.getByRole("button", { name: "Next month" }).click();
    await expect(page.locator("#date-month")).toHaveText("December 2026");
    await expect(day(page, "2026-12-24")).not.toHaveAttribute("aria-disabled");
    await tap(page, "2026-12-26");
    await expect(message(page)).toHaveText(`Sat 26 Dec: Not available: ${product.name} is only available 1 Nov to 25 Dec`);
  });

  test("AC4: no date in the 90 days: 'No dates available, contact us on WhatsApp' with the WhatsApp button", async ({ page, db, baseURL }) => {
    await basketWith(page, db, baseURL!, { season: { startsOn: "2026-11-01", endsOn: "2026-11-22" } });

    await expect(page.getByText("No dates available, contact us on WhatsApp")).toBeVisible();
    await expect(page.getByRole("link", { name: "Message us on WhatsApp" })).toHaveAttribute("href", /^https:\/\/wa\.me\/23050000000\?text=/);
    await expect(page.getByRole("grid")).toHaveCount(0);
  });

  test("AC5, AC2: a day blocked after the page opened is refused calmly; the picker shows it as Not available and keeps the rest", async ({ page, db, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== "phone-375", "changes the shared blocked dates: one project is enough");
    await basketWith(page, db, baseURL!);
    await page.getByRole("radio", { name: /^Pickup/ }).check();
    await chooseDate(page, "2027-01-13");
    await page.getByRole("radio", { name: /^Morning/ }).locator("visible=true").check();
    await page.getByLabel("Name", { exact: true }).fill("Date Guest");
    await page.getByLabel("Phone", { exact: true }).fill("5712 3456");
    await page.getByLabel("Email", { exact: true }).fill(`dates-${Date.now()}@e2e.test`);
    await page.getByRole("checkbox", { name: "I accept the order policies" }).check();

    // The worker's `db` has one connection, which the lock holds: the block goes through its own.
    const blocks = connectE2eDatabase();
    await withSettingsLock(db, async () => {
      const [block] = await blocks<{ id: string }[]>`insert into blocked_date (starts_on, ends_on, reason) values ('2027-01-13', '2027-01-13', 'E2E private reason') returning id`;
      try {
        await page.getByRole("button", { name: "Place order" }).click();
        const summary = page.locator("#error-summary");
        await expect(summary).toBeFocused();
        await expect(summary.getByRole("link", { name: "This date is no longer available. Please choose another date." })).toBeVisible();
        await expect(page.getByText("This date is no longer available. Please choose another date.", { exact: true }).last()).toBeVisible();
        await expect(day(page, "2027-01-13")).toHaveAttribute("aria-disabled", "true");
        await expect(message(page)).toHaveText("Your chosen date Wed 13 Jan is no longer available: Not available. Please choose another day.");
        await expect(page.getByText("E2E private reason")).toHaveCount(0);
        await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Date Guest");
        await expect(page.locator('input[name="date"]')).toHaveValue("2027-01-13");
      } finally {
        await blocks`delete from blocked_date where id = ${block!.id}`;
      }
    }).finally(() => blocks.end());
  });
});

test.describe("S-087 AC9 without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("a native date field from the earliest date to the horizon, labelled, with the earliest date", async ({ page, db, baseURL }) => {
    const product = await createProduct(db, { name: "No-JS date cake" });
    await setClock(page.context(), baseURL!, NOW);
    await page.context().addCookies([{ name: "apb_basket", value: encodeURIComponent(JSON.stringify([{ lineId: "n1", productId: product.id, options: [], quantity: 1 }])), url: baseURL!, sameSite: "Lax" }]);
    await page.goto("/basket");

    const field = page.getByLabel("Date", { exact: true });
    await expect(field).toHaveAttribute("type", "date");
    await expect(field).toHaveAttribute("min", "2026-11-23");
    await expect(field).toHaveAttribute("max", "2027-02-17");
    await expect(field).toHaveAccessibleDescription("Earliest date: Mon 23 Nov");
  });
});

test.describe("S-088 time windows", () => {
  test("AC1, AC6: a labelled radio group per fulfilment, 44 px rows, French times", async ({ page, db, baseURL }) => {
    await basketWith(page, db, baseURL!, {}, "/fr/basket");
    await page.getByRole("radio", { name: /^Retrait/ }).check();
    const group = page.getByRole("group", { name: "Heure de retrait" });
    await expect(group.getByRole("radio")).toHaveCount(3);
    await expect(group.getByRole("radio", { name: "Matin · 9 h–12 h" })).toBeVisible();
    await group.getByRole("radio", { name: /^Matin/ }).check();
    await expect(group.getByRole("radio", { name: /^Matin/ })).toBeChecked();
    await expectTapTargets(page);
  });
});

test.describe("screenshots for review (375 px @2x)", () => {
  test("the date picker with a reason, and the time windows", async ({ browser, db, baseURL }, testInfo) => {
    const dir = process.env.S4J2_SHOTS;
    test.skip(!dir || testInfo.project.name !== "phone-375", "only when asked for, once");
    mkdirSync(dir!, { recursive: true });
    const context = await browser.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    await basketWith(page, db, baseURL!, { noticeDays: 4 });
    await page.getByRole("radio", { name: /^Delivery/ }).check();
    await tap(page, "2026-11-22");
    await page.locator("#date-heading").scrollIntoViewIfNeeded();
    await page.locator("section[aria-labelledby=date-heading]").screenshot({ path: `${dir}/s4j2-date-picker-reason.png` });
    await day(page, "2026-11-25").click();
    await page.getByRole("radio", { name: /^Afternoon/ }).locator("visible=true").check();
    await page.locator("section[aria-labelledby=time-heading]").screenshot({ path: `${dir}/s4j2-time-windows.png` });
    await page.locator("section[aria-labelledby=date-heading]").screenshot({ path: `${dir}/s4j2-date-picker-selected.png` });
    await context.close();
  });
});

test("spokenDay names a date as the calendar does", () => {
  expect(spokenDay("2026-11-24")).toBe("Tuesday 24 November");
});
