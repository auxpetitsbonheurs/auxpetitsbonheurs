// Tracking page (S-016): /t/:token and /fr/t/:token.
import {
  expectKeyboardOperable,
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  expectNothingClipped,
  expectTapTargets,
  withZoom,
} from "./support/a11y";
import { createOrder } from "./support/database";
import { type Page, expect, test } from "./support/fixtures";

const numberOf = (n: number) => `APB-${String(n).padStart(4, "0")}`;

async function expectAccessibleLayout(page: Page) {
  for (const zoom of [1, 2]) {
    await withZoom(page, zoom, async () => {
      await expectNoHorizontalScroll(page);
      await expectNothingClipped(page);
      await expectTapTargets(page);
      await expectKeyboardOperable(page);
    });
  }
}

test.describe("S-016 tracking page", () => {
  test("AC1, AC2: shows number, badge, paid status, details, total, payment and the progress list", async ({ page, db }) => {
    const order = await createOrder(db, "S-016 content");
    const response = await page.goto(`/t/${order.trackingToken}`);
    expect(response!.status()).toBe(200);

    await expect(page.getByRole("heading", { level: 1, name: `Order ${numberOf(order.number)}` })).toBeVisible();
    await expect(page.getByText("Pending approval").first()).toBeVisible();
    await expect(page.getByText("Not paid yet")).toBeVisible();
    await expect(page.getByText("Pickup from the bakery")).toBeVisible();
    await expect(page.getByText("Morning · 09:00–12:00")).toBeVisible();
    await expect(page.getByText("Fri 20 Nov")).toBeVisible();
    await expect(page.getByText("Pickup: free")).toBeVisible();
    await expect(page.getByText("Rs 850").first()).toBeVisible();
    // An order placed before Juice payment (pending approval) shows no payment instructions and never the Juice number.
    await expect(page.getByRole("main").getByText(/5000 0000/)).toHaveCount(0);

    const progress = page.getByRole("region", { name: "Progress" });
    await expect(progress.getByText("Step 1 of 5: Pending approval")).toBeVisible();
    const steps = progress.getByRole("listitem");
    await expect(steps).toHaveText([/Pending approval/, /Approved/, /In preparation/, /Ready for pickup/, /Completed/]);
    await expect(steps.nth(0)).toHaveAttribute("aria-current", "step");
    await expect(progress.locator("ol")).toHaveCount(1);
  });

  test("AC3: wrong, unknown and malformed tokens give the same 404 page", async ({ page, db }) => {
    const order = await createOrder(db, "S-016 wrong");
    const wrong = `${order.trackingToken.slice(0, 42)}${order.trackingToken.endsWith("A") ? "B" : "A"}`;
    const bodies = new Set<string>();
    for (const token of [wrong, "Q".repeat(43), "not-a-token"]) {
      const response = await page.goto(`/t/${token}`);
      expect(response!.status()).toBe(404);
      await expect(page.getByRole("heading", { level: 1, name: "We can't find this order" })).toBeVisible();
      bodies.add((await page.locator("main").innerText()).replaceAll(token, ""));
    }
    expect(bodies.size).toBe(1);
  });

  test("AC4: no-store, noindex and no-referrer headers; nothing about other customers", async ({ page, db }) => {
    const other = await createOrder(db, "S-016 someone else");
    const order = await createOrder(db, "S-016 headers");
    const response = await page.goto(`/t/${order.trackingToken}`);
    const headers = response!.headers();

    expect(headers["cache-control"]).toBe("no-store");
    expect(headers["x-robots-tag"]).toContain("noindex");
    expect(headers["referrer-policy"]).toBe("no-referrer");
    const html = await page.content();
    for (const secret of [other.trackingToken, "S-016 someone else", "S-016 headers", numberOf(other.number)]) expect(html).not.toContain(secret);
  });

  test("AC5: a French order opened from its English link is in French with the language switch", async ({ page, db }) => {
    const order = await createOrder(db, "S-016 fr");
    await db`update orders set locale = 'fr' where id = ${order.id}`;
    await page.goto(`/t/${order.trackingToken}`);

    await expect(page).toHaveURL(new RegExp(`/fr/t/${order.trackingToken}$`));
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByText("Étape 1 sur 5 : En attente d'acceptation")).toBeVisible();
    await page.getByRole("link", { name: /English/ }).click();
    await expect(page).toHaveURL(new RegExp(`/t/${order.trackingToken}$`));
    await expect(page.getByText("Step 1 of 5: Pending approval")).toBeVisible();
  });

  test("AC7: keyboard order, visible focus, no clipping or sideways scroll, 44 px targets at 100% and 200%", async ({ page, db }) => {
    const order = await createOrder(db, "S-016 layout");
    await page.goto(`/t/${order.trackingToken}`);

    await expectAccessibleLayout(page);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`AC8: axe clean in ${colorScheme} mode for pending and approved, and on the not-found page`, async ({ page, db }) => {
      await page.emulateMedia({ colorScheme });
      const order = await createOrder(db, `S-016 axe ${colorScheme}`);
      await page.goto(`/t/${order.trackingToken}`);
      await expectNoA11yViolations(page);
      await expectNoA11yViolations(page, { zoom: 2 });

      await db`update orders set status = 'approved' where id = ${order.id}`;
      await page.reload();
      await expect(page.getByText("Step 2 of 5: Approved")).toBeVisible();
      await expectNoA11yViolations(page);

      await page.goto(`/t/${"Q".repeat(43)}`);
      await expectNoA11yViolations(page);
    });
  }
});
