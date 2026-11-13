// S-062 (promo banner) AC3 and AC8 in the browser, and the S-082 / S-066 AC4 prices a customer
// sees (product page, menu card, basket line). Each test makes its own promotion in its own
// one-day window years ahead and fixes the server clock inside it (apb_test_now), so specs
// running in parallel, at three widths, never see each other's banner or prices.
import { randomInt } from "node:crypto";
import type postgres from "postgres";
import { expectNoA11yViolations, expectNoHorizontalScroll, expectNothingClipped, expectTapTargets, tabThrough, withZoom } from "./support/a11y";
import { createProduct } from "./support/catalogue";
import { setClock } from "./support/clock";
import { type Page, expect, test } from "./support/fixtures";

interface Window {
  starts: string;
  ends: string;
  /** An instant inside the window (noon, Mauritius). */
  inside: string;
}

/** A one-day window (09:00 to 18:00 Mauritius) on a random day in 2031-2040. */
function ownWindow(): Window {
  const day = new Date(Date.UTC(2031, 0, 1) + randomInt(0, 3600) * 86_400_000).toISOString().slice(0, 10);
  return { starts: `${day}T05:00:00Z`, ends: `${day}T14:00:00Z`, inside: `${day}T08:00:00Z` };
}

async function promotion(db: postgres.Sql, window: Window, values: { title: string; placement: "banner" | "card" | "both"; productId?: string; percentOff?: number }) {
  const [row] = await db<{ id: string }[]>`
    insert into promotion (title_en, title_fr, text_en, text_fr, starts_at, ends_at, placement, link_kind, link_product_id)
    values (${values.title}, ${`${values.title} (FR)`}, ${"Twenty percent off our celebration cakes this week, while they last."}, ${"Vingt pour cent de remise cette semaine."},
            ${window.starts}, ${window.ends}, ${values.placement}, ${values.productId ? "product" : "none"}, ${values.productId ?? null})
    returning id`;
  if (values.productId && values.percentOff) {
    await db`insert into promotion_product (promotion_id, product_id, discount_kind, percent_off) values (${row!.id}, ${values.productId}, 'percent', ${values.percentOff})`;
  }
  return row!.id;
}

async function open(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
}

const banner = (page: Page) => page.getByRole("complementary", { name: "Current offer" });

test.describe("promo banner (S-062)", () => {
  test("AC1, AC3: shows with its link; Dismiss hides it for the visit; a new session shows it again", async ({ page, db, baseURL, browser }) => {
    const window = ownWindow();
    const product = await createProduct(db, { name: "Offer cake" });
    const title = `Spring offer ${randomInt(1e6)}`;
    await promotion(db, window, { title, placement: "banner", productId: product.id });
    await setClock(page.context(), baseURL!, window.inside);

    await open(page, "/");
    await expect(banner(page).getByRole("link", { name: new RegExp(title) })).toHaveAttribute("href", `/menu/${product.slug}`);
    await banner(page).getByRole("button", { name: `Dismiss offer: ${title}` }).click();
    await expect(banner(page)).toHaveCount(0);
    await expect(page.getByRole("main")).toBeFocused();

    // Another page in the same visit (a full load: the server reads the session cookie).
    await expect.poll(async () => (await page.context().cookies()).some((c) => c.name === "apb_banner_dismissed")).toBe(true);
    await open(page, "/menu");
    await expect(banner(page)).toHaveCount(0);

    // A new browser session (no session cookie) shows it again.
    const fresh = await browser.newContext();
    await setClock(fresh, baseURL!, window.inside);
    const other = await fresh.newPage();
    await open(other, "/fr");
    await expect(other.getByRole("complementary", { name: "Offre du moment" })).toContainText(`${title} (FR)`);
    await fresh.close();
  });

  test("AC8: 44 px targets, labelled Dismiss, keyboard, axe light and dark, 200% zoom with no clipping", async ({ page, db, baseURL }) => {
    const window = ownWindow();
    const product = await createProduct(db, { name: "Zoom cake" });
    const title = `A rather long celebration offer title ${randomInt(1e6)}`;
    await promotion(db, window, { title, placement: "both", productId: product.id });
    await setClock(page.context(), baseURL!, window.inside);
    await open(page, "/menu");

    await expect(banner(page)).toBeVisible();
    await expectTapTargets(page);
    await expectNoHorizontalScroll(page);
    await expectNothingClipped(page);
    // Keyboard: after the skip link, the banner's link then Dismiss, each with a visible focus ring.
    const { stops } = await tabThrough(page, 3);
    // (the helper cuts names to 40 characters)
    expect(stops.slice(1, 3).map((s) => [s.name, s.visibleFocus])).toEqual([[title.slice(0, 40), true], [`Dismiss offer: ${title}`.slice(0, 40), true]]);
    await expectNoA11yViolations(page);
    await withZoom(page, 2, async () => {
      await expectNoHorizontalScroll(page);
      await expectNothingClipped(page);
      await expectTapTargets(page);
    });
    await page.emulateMedia({ colorScheme: "dark" });
    await expectNoA11yViolations(page);
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    await banner(page).getByRole("button", { name: `Dismiss offer: ${title}` }).focus();
    await page.keyboard.press("Enter");
    await expect(banner(page)).toHaveCount(0);
  });

  test("an offer price: struck original and 'Was …, now …' on the product page, the menu card and the basket line", async ({ page, db, baseURL }) => {
    const window = ownWindow();
    const product = await createProduct(db, { name: "Sale cake", priceRs: 1000 });
    await promotion(db, window, { title: `Card offer ${randomInt(1e6)}`, placement: "card", productId: product.id, percentOff: 20 });
    await setClock(page.context(), baseURL!, window.inside);

    await open(page, `/menu/${product.slug}`);
    const main = page.getByRole("main");
    await expect(main.locator("s").first()).toHaveText("Rs 1,000");
    await expect(main.getByText("Was Rs 1,000, now Rs 800").first()).toBeAttached();
    await expect(main.getByText(/^Offer ends .* at 18:00$/)).toBeVisible();
    await expect(page.getByTestId("live-price")).toContainText("Rs 800");
    await expectNoA11yViolations(page);

    await main.getByRole("button", { name: "Add to basket" }).click();
    await expect(main.getByRole("status").getByText(/added/i)).toBeVisible();

    await open(page, "/menu");
    await expect(page.getByText("Was from Rs 1,000, now from Rs 800")).toBeAttached();

    await open(page, "/basket");
    const line = page.getByRole("listitem").filter({ hasText: product.name });
    await expect(line.locator("s")).toContainText("Rs 1,000");
    await expect(line.getByText("Rs 800").first()).toBeVisible();
    await expect(page.getByText("Subtotal").locator("..")).toContainText("Rs 800");
    await expectNoA11yViolations(page);
  });
});

test.describe("promo banner without JavaScript (S-062 AC3)", () => {
  test.use({ javaScriptEnabled: false });

  test("Dismiss posts the form and comes back to the same page without the banner", async ({ page, db, baseURL }) => {
    const window = ownWindow();
    const title = `No-JS offer ${randomInt(1e6)}`;
    await promotion(db, window, { title, placement: "banner" });
    await setClock(page.context(), baseURL!, window.inside);

    await page.goto("/menu");
    await expect(banner(page)).toContainText(title);
    await banner(page).getByRole("button", { name: `Dismiss offer: ${title}` }).click();
    await expect(page).toHaveURL(/\/menu$/);
    await expect(banner(page)).toHaveCount(0);
  });
});
