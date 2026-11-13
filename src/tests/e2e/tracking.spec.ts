// Tracking page (S-016; E-05 S-094..S-096): /t/:token and /fr/t/:token.
import { mkdirSync } from "node:fs";
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

/** 375 px screenshots for the review report, only when E05_SHOTS names a folder. */
async function shot(page: Page, name: string) {
  const dir = process.env.E05_SHOTS;
  if (!dir || page.viewportSize()?.width !== 375) return;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/checkout-${name}.png`, fullPage: true });
}

test.describe("S-096 customer cancel, S-094 WhatsApp, S-095 final states", () => {
  test("S-096 AC1, AC10, S-094 AC1: Cancel opens a labelled dialog; Keep order and Esc return focus; confirming shows Cancelled", async ({ page, db }) => {
    const order = await createOrder(db, "S-096 cancel");
    const number = numberOf(order.number);
    await page.goto(`/t/${order.trackingToken}`);

    const whatsapp = page.getByRole("link", { name: `Message us on WhatsApp about ${number}` });
    await expect(whatsapp).toHaveAttribute("href", `https://wa.me/23050000000?text=${encodeURIComponent(`Hello, about my order ${number}`)}`);
    await expect(page.getByRole("button", { name: /edit/i })).toHaveCount(0);

    const trigger = page.getByRole("button", { name: `Cancel order ${number}` });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: `Cancel order ${number}?` });
    await expect(dialog).toBeVisible();
    await shot(page, "cancel-dialog");
    await expect(dialog.getByRole("button", { name: `Cancel order ${number}` })).toBeVisible();
    await dialog.getByRole("button", { name: "Keep order" }).click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.press("Enter");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await dialog.getByRole("button", { name: `Cancel order ${number}` }).click();
    await expect(page.getByText("Nothing will be prepared. We have sent you an email to confirm.")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "This order was cancelled" })).toBeFocused();
    await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: `Cancel order ${number}` })).toHaveCount(0);
    const [row] = await db<{ status: string; version: number }[]>`select status, version from orders where id = ${order.id}`;
    expect(row).toEqual({ status: "cancelled", version: 2 });
    await shot(page, "tracking-cancelled");
    await expectNoA11yViolations(page);
  });

  test("S-096 AC4: the order changed while the dialog was open: calm message, page shows the current state", async ({ page, db }) => {
    const order = await createOrder(db, "S-096 changed");
    const number = numberOf(order.number);
    await page.goto(`/t/${order.trackingToken}`);
    await page.getByRole("button", { name: `Cancel order ${number}` }).click();
    await db`update orders set status = 'approved', version = 2 where id = ${order.id}`;

    await page.getByRole("dialog").getByRole("button", { name: `Cancel order ${number}` }).click();
    await expect(page.getByRole("alert")).toContainText("This order can no longer be cancelled here.");
    await expect(page.getByText("Step 2 of 5: Approved")).toBeVisible();
    await expect(page.getByRole("button", { name: `Cancel order ${number}` })).toHaveCount(0);
  });

  test("S-096 AC3: approved shows the WhatsApp guidance with the 48-hour rule and no Cancel", async ({ page, db }) => {
    const order = await createOrder(db, "S-096 approved");
    await db`update orders set status = 'approved' where id = ${order.id}`;
    await page.goto(`/t/${order.trackingToken}`);

    await expect(page.getByText("To change or cancel, message us on WhatsApp. Free cancellation until 48 hours before your order date.")).toBeVisible();
    await expect(page.getByRole("button", { name: /Cancel order/ })).toHaveCount(0);
    await shot(page, "tracking-approved");
  });

  test("S-095 AC2, AC4, AC5: declined shows an Alert with the reason as plain text instead of the progress list; French wording", async ({ page, db }) => {
    const order = await createOrder(db, "S-095 declined");
    await db`update orders set status = 'declined', decline_reason = ${"Fully booked <b>that day</b>"}, locale = 'fr' where id = ${order.id}`;
    await page.goto(`/fr/t/${order.trackingToken}`);

    await expect(page.getByText("Nous ne pouvons pas réaliser cette commande")).toBeVisible();
    await expect(page.getByText("Notre message : Fully booked <b>that day</b>")).toBeVisible();
    await expect(page.getByText("Refusée", { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Avancement" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Annuler la commande/ })).toHaveCount(0);
    await shot(page, "tracking-declined-fr");
    await expectNoA11yViolations(page);
  });

  test("S-096 AC10: the dialog at 100% and 200% zoom: keyboard, 44 px targets, no sideways scroll", async ({ page, db }) => {
    const order = await createOrder(db, "S-096 layout");
    await page.goto(`/t/${order.trackingToken}`);
    await expectAccessibleLayout(page);
    await page.getByRole("button", { name: `Cancel order ${numberOf(order.number)}` }).click();
    await expectNoA11yViolations(page);
    await expectNoA11yViolations(page, { zoom: 2 });
    for (const zoom of [1, 2]) await withZoom(page, zoom, async () => {
      await expectNoHorizontalScroll(page);
      await expectTapTargets(page);
    });
  });
});

test.describe("S-096 without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("Cancel leads to an inline confirm step, and confirming cancels the order", async ({ page, db }) => {
    const order = await createOrder(db, "S-096 no js");
    const number = numberOf(order.number);
    await page.goto(`/t/${order.trackingToken}`);

    await page.getByRole("button", { name: `Cancel order ${number}` }).click();
    await expect(page.getByRole("heading", { name: `Cancel order ${number}?` })).toBeVisible();
    await page.getByRole("button", { name: `Cancel order ${number}` }).click();
    await expect(page.getByText("Nothing will be prepared. We have sent you an email to confirm.")).toBeVisible();
    const [row] = await db<{ status: string }[]>`select status from orders where id = ${order.id}`;
    expect(row!.status).toBe("cancelled");
  });
});
