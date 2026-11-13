// S-066 (choose options, live price, add to basket) and S-067 (message on cake) in a real
// browser, at 320, 375 and 1280 px: required choices, the live price, Add with and without
// JavaScript, the message limit, and accessibility (axe, 200% zoom, keyboard, tap targets,
// the sticky Add bar never covering a focused control).
import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { SAMPLE_PHOTO } from "../../app/db/sample-data";
import { expectKeyboardOperable, expectNoA11yViolations, expectNoHorizontalScroll, expectNothingClipped, expectTapTargets, withZoom } from "./support/a11y";
import { type Page, expect, test } from "./support/fixtures";

interface Choice {
  name: string;
  deltaRs: number;
}

/** A product of this test alone with one required pick-one group (the real menu's shape). */
async function productWithGroup(db: postgres.Sql, options: { name: string; type: "cake" | "dessert"; baseRs: number; group: string; groupFr: string; choices: Choice[] }) {
  const tag = randomUUID().slice(0, 8);
  const name = `${options.name} ${tag}`;
  const slug = `e2e-opt-${tag}`;
  const [product] = await db<{ id: string }[]>`
    insert into product (slug, type, name_en, base_price_rs) values (${slug}, ${options.type}, ${name}, ${options.baseRs}) returning id`;
  await db`insert into product_photo (product_id, storage_path, width, height, sort_order) values (${product!.id}, ${SAMPLE_PHOTO.storagePath}, ${SAMPLE_PHOTO.width}, ${SAMPLE_PHOTO.height}, 0)`;
  const [group] = await db<{ id: string }[]>`
    insert into option_group (product_id, name_en, name_fr, kind, required, sort_order) values (${product!.id}, ${options.group}, ${options.groupFr}, 'single', true, 0) returning id`;
  for (const [i, choice] of options.choices.entries()) {
    await db`insert into option_choice (group_id, name_en, price_delta_rs, sort_order) values (${group!.id}, ${choice.name}, ${choice.deltaRs}, ${i})`;
  }
  return { id: product!.id, name, path: `/menu/${slug}` };
}

const SIZES: Choice[] = [
  { name: "6 inch (5–10 people)", deltaRs: 0 },
  { name: "7 inch (10–15 people)", deltaRs: 300 },
  { name: "8 inch (15–20 people)", deltaRs: 600 },
];
const BOXES: Choice[] = [
  { name: "Box of 6", deltaRs: 0 },
  { name: "Box of 12", deltaRs: 360 },
  { name: "Box of 18", deltaRs: 660 },
];

const cake = (db: postgres.Sql) => productWithGroup(db, { name: "Red velvet", type: "cake", baseRs: 1200, group: "Size", groupFr: "Taille", choices: SIZES });
const cookies = (db: postgres.Sql) => productWithGroup(db, { name: "Cookies", type: "dessert", baseRs: 420, group: "Box", groupFr: "Boîte", choices: BOXES });

async function hydrated(page: Page) {
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
}

const livePrice = (page: Page) => page.getByTestId("live-price");
const basketLines = async (page: Page) => {
  const cookie = (await page.context().cookies()).find((c) => c.name === "apb_basket");
  return cookie ? (JSON.parse(decodeURIComponent(cookie.value)) as { options: { choiceIds: string[] }[]; cakeMessage?: string; quantity: number }[]) : [];
};

test.describe("S-066 options and live price", () => {
  test("AC3: Add with no size chosen adds nothing, focuses the Size group and says Choose a size; the button stays enabled", async ({ page, db }) => {
    const product = await cake(db);
    await page.goto(product.path);
    await hydrated(page);
    await expect(livePrice(page)).toHaveText("From Rs 1,200");

    const add = page.getByRole("button", { name: "Add to basket" });
    await add.click();

    await expect(page.getByText("Choose a size")).toBeVisible();
    await expect(page.getByRole("radio", { name: /6 inch/ })).toBeFocused();
    await expect(page.getByRole("group", { name: /Size/ })).toHaveAccessibleDescription("Choose a size");
    await expect(add).toBeEnabled();
    expect(await basketLines(page)).toEqual([]);

    // Choosing clears the message at once (calm validation).
    await page.getByRole("radio", { name: /8 inch/ }).check();
    await expect(page.getByText("Choose a size")).toHaveCount(0);
  });

  test("AC1, AC2: choices show their price change; the price follows the size and quantity at once; Add stores the choice", async ({ page, db }) => {
    const product = await cake(db);
    await page.goto(product.path);
    await hydrated(page);
    await expect(page.getByRole("group", { name: /Size \(Required\)/ })).toBeVisible();
    await expect(page.getByText("+Rs 600")).toBeVisible();

    await page.getByRole("radio", { name: /8 inch/ }).check();
    await expect(livePrice(page)).toHaveText("Rs 1,800");
    await page.getByRole("button", { name: `Increase quantity of ${product.name}` }).click();
    await expect(livePrice(page)).toHaveText("Rs 3,600 for 2");
    await expect(page.locator("p[aria-live=polite]").filter({ hasText: "Price Rs 3,600 for 2" })).toBeAttached();

    await page.getByRole("button", { name: "Add to basket" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Added to your basket" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Basket, 2 items" })).toBeVisible();

    // The basket prices the line the same way (domain/pricing) and shows the size.
    await page.getByRole("link", { name: "View basket" }).click();
    await expect(page.getByText("8 inch (15–20 people)")).toBeVisible();
    await expect(page.getByText("Rs 1,800 each")).toBeVisible();
    await expect(page.getByText("Rs 3,600").first()).toBeVisible();
  });

  test("cookies: choosing a box of 12 prices it at Rs 780", async ({ page, db }) => {
    const product = await cookies(db);
    await page.goto(product.path);
    await hydrated(page);
    await expect(livePrice(page)).toHaveText("From Rs 420");

    await page.getByRole("radio", { name: /Box of 12/ }).check();

    await expect(livePrice(page)).toHaveText("Rs 780");
    await expect(page.getByLabel("Message on the cake")).toHaveCount(0);
  });

  test("AC6: the same configuration twice is one line of 2; another size is a new line", async ({ page, db }) => {
    const product = await cake(db);
    await page.goto(product.path);
    await hydrated(page);
    const add = page.getByRole("button", { name: "Add to basket" });
    await page.getByRole("radio", { name: /7 inch/ }).check();
    await add.click();
    await page.waitForFunction((at) => performance.now() - at > 850, await page.evaluate(() => performance.now()));
    await add.click();
    await expect(page.getByRole("status").filter({ hasText: "(2 in basket)" })).toBeVisible();
    await page.waitForFunction((at) => performance.now() - at > 850, await page.evaluate(() => performance.now()));
    await page.getByRole("radio", { name: /6 inch/ }).check();
    await add.click();

    await expect.poll(async () => (await basketLines(page)).map((l) => l.quantity)).toEqual([2, 1]);
  });

  test("AC5: without JavaScript the form posts and the basket shows the line", async ({ browser, db }) => {
    const product = await cake(db);
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(product.path);

    await page.getByRole("radio", { name: /8 inch/ }).check();
    await page.getByRole("button", { name: "Add to basket" }).click();

    await expect(page).toHaveURL(/\/basket$/);
    await expect(page.getByText("8 inch (15–20 people)")).toBeVisible();
    await context.close();
  });

  test("AC5, AC8: without JavaScript a missing size is refused with Choose a size and nothing is added", async ({ browser, db }) => {
    const product = await cake(db);
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(product.path);
    await page.getByLabel("Message on the cake").fill("Happy birthday");

    await page.getByRole("button", { name: "Add to basket" }).click();

    await expect(page.getByText("Choose a size")).toBeVisible();
    // The page keeps what was typed (UX: nothing to type twice).
    await expect(page.getByLabel("Message on the cake")).toHaveValue("Happy birthday");
    expect((await context.cookies()).find((c) => c.name === "apb_basket")).toBeUndefined();
    await context.close();
  });

  test("AC11: axe, 200% zoom, keyboard, tap targets; the sticky bar never covers a focused control", async ({ page, db }) => {
    const product = await cake(db);
    await page.goto(product.path);
    await hydrated(page);
    await page.getByRole("radio", { name: /7 inch/ }).check();
    await page.getByLabel("Message on the cake").fill("Happy birthday Zoé 🎂");

    await expectNoA11yViolations(page);
    await expectNoA11yViolations(page, { zoom: 2 });
    for (const zoom of [1, 2]) {
      await withZoom(page, zoom, async () => {
        await expectNoHorizontalScroll(page);
        await expectNothingClipped(page);
        await expectTapTargets(page);
        await expectKeyboardOperable(page);
      });
    }

    // Tab through the ordering area: each focused control sits fully above the sticky bar.
    await page.getByRole("radio", { name: /7 inch/ }).focus();
    for (let i = 0; i < 8; i += 1) {
      const covered = await page.evaluate(async () => {
        // Measure once the focus scroll has been painted.
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
        const bar = document.querySelector<HTMLElement>("[data-add-bar]")!;
        const focused = document.activeElement as HTMLElement | null;
        // Only the ordering controls before the bar can scroll under it (the sticky site header
        // may pass over a static bar when the page is scrolled; that is not this check).
        if (!focused || !bar.closest("form")!.contains(focused) || bar.contains(focused) || !(bar.compareDocumentPosition(focused) & Node.DOCUMENT_POSITION_PRECEDING)) return null;
        const b = bar.getBoundingClientRect();
        const f = focused.getBoundingClientRect();
        const label = `${focused.tagName} ${focused.getAttribute("name") ?? focused.getAttribute("aria-label") ?? ""} ${Math.round(f.top)}-${Math.round(f.bottom)} bar ${Math.round(b.top)}-${Math.round(b.bottom)}`;
        return f.bottom > b.top + 0.5 && f.top < b.bottom ? label : null;
      });
      expect(covered, "a focused control is under the sticky Add bar").toBeNull();
      await page.keyboard.press("Tab");
    }
  });
});

test.describe("S-067 message on cake", () => {
  test("AC1: the 41st character is not accepted; the counter reads 40 / 40 with words", async ({ page, db }) => {
    const product = await cake(db);
    await page.goto(product.path);
    await hydrated(page);
    const field = page.getByLabel("Message on the cake");

    await field.fill("a".repeat(40));
    await field.press("End");
    await field.pressSequentially("b");

    await expect(field).toHaveValue("a".repeat(40));
    await expect(page.getByText("40 / 40 · Limit reached: 40 characters")).toBeVisible();
    await expect(field).toHaveAttribute("aria-describedby", /cakeMessage-counter/);
  });

  test("AC7: a paste over the limit is refused with a reason, not silently cut", async ({ page, db }) => {
    const product = await cake(db);
    await page.goto(product.path);
    await hydrated(page);
    const field = page.getByLabel("Message on the cake");
    await field.fill("Happy ");

    await field.evaluate((input: HTMLInputElement, text) => {
      // A paste: the whole text arrives in one input event.
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, input.value + text);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, "x".repeat(60));

    await expect(field).toHaveValue("Happy ");
    await expect(page.getByRole("alert").filter({ hasText: "longer than 40 characters, so it was not added" })).toBeVisible();
  });

  test("AC3: 40 emoji fit and are stored as typed", async ({ page, db }) => {
    const product = await cake(db);
    await page.goto(product.path);
    await hydrated(page);
    await page.getByRole("radio", { name: /6 inch/ }).check();
    await page.getByLabel("Message on the cake").fill("🎂".repeat(40));
    await expect(page.getByText("40 / 40")).toBeVisible();

    await page.getByRole("button", { name: "Add to basket" }).click();

    await expect.poll(async () => (await basketLines(page))[0]?.cakeMessage).toBe("🎂".repeat(40));
  });
});
