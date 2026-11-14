// Full payment by MCB Juice at order (S-282; spec docs/specs/features/juice-payment.md): a
// guest orders on a phone and gets the Juice instructions at once, the Owner marks Payment
// received, and tracking shows the order paid; an order left unpaid is cancelled by the hourly
// job; the instructions are French on a French order. The Juice Settings are shared by every
// worker, so tests that set them hold the Settings lock and put the old values back.
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { paymentDeadlines } from "../../app/jobs/payment-deadlines";
import type { JobContext } from "../../app/jobs/types";
import { expectKeyboardOperable, expectNoA11yViolations, expectNoHorizontalScroll, expectNothingClipped, expectTapTargets, withZoom } from "./support/a11y";
import { signIn } from "./support/admin";
import { chooseDate } from "./support/checkout-date";
import { setClock } from "./support/clock";
import { orderFormReady } from "./support/product";
import { E2E_ACCOUNTS, E2E_DATABASE_URL, SAMPLE_PRODUCT, connectE2eDatabase, createOrder } from "./support/database";
import { type Page, expect, test } from "./support/fixtures";
import { withSettingsLock } from "./support/settings-lock";

const SHOTS = "/tmp/claude-0/-home-user-auxpetitsbonheurs/9106cb54-2393-55df-a3cb-bd8500903b6a/scratchpad";
const TOKEN_URL = /\/order\/([A-Za-z0-9_-]{43})\/confirmed$/;
const numberOf = (n: number) => `APB-${String(n).padStart(4, "0")}`;
type Sql = Parameters<typeof createOrder>[0];

/**
 * Sets the Juice details for `work`, then puts back what was there, under the Settings lock.
 * The lock holds its own connection: the worker's pool has one, which `work` needs.
 */
async function withJuiceSettings<T>(db: Sql, work: () => Promise<T>): Promise<T> {
  const lock = connectE2eDatabase();
  try {
    return await withJuiceSettingsLocked(lock, db, work);
  } finally {
    await lock.end();
  }
}

async function withJuiceSettingsLocked<T>(lock: Sql, db: Sql, work: () => Promise<T>): Promise<T> {
  return withSettingsLock(lock, async () => {
    const [before] = await db<{ juice_name: string | null; juice_number: string | null; payment_whatsapp: string | null }[]>`
      select juice_name, juice_number, payment_whatsapp from settings where id = 1`;
    await db`update settings set juice_name = 'E2E Baker', juice_number = '5000 0071', payment_whatsapp = '5000 0072' where id = 1`;
    try {
      return await work();
    } finally {
      await db`update settings set juice_name = ${before!.juice_name}, juice_number = ${before!.juice_number}, payment_whatsapp = ${before!.payment_whatsapp} where id = 1`;
    }
  });
}

async function accessible(page: Page) {
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
  for (const zoom of [1, 2]) {
    await withZoom(page, zoom, async () => {
      await expectNoHorizontalScroll(page);
      await expectNothingClipped(page);
      await expectTapTargets(page);
    });
  }
  await expectNoA11yViolations(page);
}

const isPhone375 = () => test.info().project.name === "phone-375";

async function placePickupOrder(page: Page, email: string) {
  await page.goto(`/menu/${SAMPLE_PRODUCT.slug}`);
  await orderFormReady(page);
  await page.getByRole("button", { name: "Add to basket" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Added to your basket" })).toBeVisible();
  await page.goto("/basket");
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
  await expect(page.getByText("Payment: the full amount by MCB Juice. We confirm your order first, then send you the payment details.")).toBeVisible();
  await expect(page.getByText("5000 0071")).toHaveCount(0);
  await page.getByRole("radio", { name: /^Pickup/ }).check();
  await chooseDate(page, "2026-11-24");
  await page.getByRole("radio", { name: /^Morning/ }).locator("visible=true").check();
  await page.getByLabel("Name", { exact: true }).fill("Juice Guest");
  await page.getByLabel("Phone", { exact: true }).fill("5712 3456");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("checkbox", { name: "I accept the order policies" }).check();
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page).toHaveURL(TOKEN_URL);
  return TOKEN_URL.exec(page.url())![1]!;
}

test.describe("S-282 Juice payment", () => {
  test("AC1: place → pending approval, no Juice details → Owner approves (payment details on WhatsApp) → payment guide on tracking → Payment received → confirmed", async ({ page, context, browser, baseURL, db }) => {
    await setClock(context, baseURL!, "2026-11-20T06:00:00Z");
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL! });
    await withJuiceSettings(db, async () => {
      const token = await placePickupOrder(page, `juice-${test.info().project.name}@e2e.test`);
      const [order] = await db<{ id: string; number: number; status: string }[]>`select id, number, status from orders where tracking_token = ${token}`;
      const number = numberOf(order!.number);
      // Approve, then pay (Owner decision 2026-11-14): received, waiting for the bakery's approval.
      expect(order!.status).toBe("pending_approval");
      const next = page.getByTestId("next-steps");
      await expect(next.getByText("Your order is received. We check it and confirm it with you, then send you the payment details. Please do not pay yet.")).toBeVisible();
      await expect(next.getByRole("listitem")).toHaveText([
        "We check your order and approve it.",
        "We email you how to pay by MCB Juice. The payment details also appear on your tracking page.",
        "You pay within 24 hours and send us the proof on WhatsApp. Your order is then confirmed.",
      ]);
      await expect(page.getByRole("region", { name: "Pay now to confirm your order" })).toHaveCount(0);
      await expect(page.getByText("5000 0071")).toHaveCount(0);
      await accessible(page);
      if (isPhone375()) await page.screenshot({ path: `${SHOTS}/approvepay-confirmation.png`, fullPage: true });
      await page.goto(`/t/${token}`);
      await expect(page.getByText("Waiting for our approval")).toBeVisible();
      await expect(page.getByRole("region", { name: "Progress" }).getByText("Step 1 of 6: Pending approval")).toBeVisible();
      await expect(page.getByText("5000 0071")).toHaveCount(0);

      // The Owner approves at 08:00Z: the payment clock starts, the customer is emailed, and the
      // payment details are one tap away on WhatsApp.
      const phone = await browser.newContext({ viewport: page.viewportSize()! });
      await setClock(phone, baseURL!, "2026-11-20T08:00:00Z");
      const owner = await phone.newPage();
      await signIn(owner, E2E_ACCOUNTS.owner, `/admin/orders/${order!.id}`);
      await expect(owner.locator("html")).toHaveAttribute("data-hydrated", "true");
      await expect(owner.getByText("Not paid yet. Approving sends the customer the Juice payment details; they then have 24 hours to pay.")).toBeVisible();
      await owner.getByRole("button", { name: `Approve ${number}` }).click();
      await expect(owner.getByRole("status").filter({ hasText: `Order ${number} approved. The customer gets the payment details by email.` })).toBeFocused();
      await expect(owner.getByTestId("order-status")).toHaveText("Awaiting payment");
      const sendDetails = owner.getByRole("region", { name: "Payment" }).getByRole("link", { name: "Send payment details on WhatsApp (opens WhatsApp)" });
      await expect(sendDetails).toBeVisible();
      const detailsHref = await sendDetails.getAttribute("href");
      expect(detailsHref).toMatch(/^https:\/\/wa\.me\/2305712345\d\?text=/);
      expect(decodeURIComponent(detailsHref!.split("text=")[1]!)).toBe(
        `Hello Juice, your order ${number} for Tuesday, 24 November 2026 is approved! To confirm it, please send Rs 850 by Juice to E2E Baker (5000 0071) with the reference ${number}, by Sat 21 Nov, 12:00. Then reply here with your payment screenshot. Thank you!`,
      );
      expect(await db`select template from email_outbox where order_id = ${order!.id} and template in ('order_received', 'payment_instructions') order by template`).toEqual([
        { template: "order_received" },
        { template: "payment_instructions" },
      ]);
      await accessible(owner);
      if (isPhone375()) await owner.screenshot({ path: `${SHOTS}/approvepay-admin-approve.png`, fullPage: true });

      // S-278 AC2, AC3 (since 2026-11-14 on tracking, after the approval): the payment guide.
      await page.goto(`/t/${token}`);
      const card = page.getByRole("region", { name: "Pay now to confirm your order" });
      await expect(card).toBeVisible();
      await expect(page.getByRole("region", { name: "Progress" }).getByText("Step 2 of 6: Awaiting payment")).toBeVisible();
      await expect(card.getByText(`Pay Rs 850 by Juice to E2E Baker (5000 0071), reference ${number}.`)).toBeVisible();
      await expect(card.getByRole("listitem").filter({ hasText: /^(Open MCB Juice|Write|Send us)/ })).toHaveText([
        "Open MCB Juice and send Rs 850 to 5000 0071 (E2E Baker).",
        `Write ${number} as the reference, so we find your payment.`,
        "Send us the Juice confirmation screenshot on WhatsApp.",
      ]);
      await expect(card.getByText("Please pay by Sat 21 Nov, 12:00. Orders not paid within 24 hours of approval are cancelled.")).toBeVisible();
      const status = card.getByRole("status");
      await card.getByRole("button", { name: "Copy Juice number" }).click();
      await expect(status).toHaveText("Juice number copied");
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("50000071");
      await card.getByRole("button", { name: "Copy amount" }).click();
      await expect(status).toHaveText("Amount copied");
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("850");
      await card.getByRole("button", { name: "Copy reference" }).click();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(number);
      const proof = card.getByRole("link", { name: /Send proof on WhatsApp/ });
      const href = await proof.getAttribute("href");
      expect(href).toMatch(/^https:\/\/wa\.me\/23050000072\?text=/);
      expect(decodeURIComponent(href!.split("text=")[1]!)).toBe(`Hello, here is my Juice payment proof for order ${number} (Rs 850).`);
      await accessible(page);
      await expectKeyboardOperable(page);
      if (isPhone375()) await page.screenshot({ path: `${SHOTS}/approvepay-tracking-payment.png`, fullPage: true });

      // S-279 AC1, AC2: two hours after the approval the Owner sees it waiting with the time left
      // (counted from the approval) and confirms the payment.
      await setClock(phone, baseURL!, "2026-11-20T10:00:00Z");
      await owner.goto("/admin/orders?tab=payment");
      await expect(owner.getByRole("heading", { level: 2, name: "Awaiting payment" })).toBeVisible();
      const row = owner.getByRole("listitem").filter({ has: owner.getByRole("link", { name: `Order ${number}`, exact: true }) });
      await expect(row).toContainText("22 h left");
      await accessible(owner);
      if (isPhone375()) await owner.screenshot({ path: `${SHOTS}/juice-admin-awaiting.png`, fullPage: true });
      await row.getByRole("link", { name: `Order ${number}`, exact: true }).click();
      await expect(owner.getByRole("heading", { level: 1, name: `Order ${number}` })).toBeVisible();
      await expect(owner.locator("html")).toHaveAttribute("data-hydrated", "true");
      await owner.getByRole("button", { name: "Payment received" }).click();
      await expect(owner.getByText(`Rs 850 received by Juice for ${number}?`)).toBeVisible();
      await expect(owner.getByRole("button", { name: "Yes, payment received" })).toBeFocused();
      await owner.getByRole("button", { name: "Yes, payment received" }).click();
      await expect(owner.getByRole("status").filter({ hasText: `Order ${number} marked paid and confirmed.` })).toBeFocused();
      await expect(owner.getByRole("button", { name: `Undo payment received for ${number}` })).toBeVisible();
      await expectNoA11yViolations(owner);
      await phone.close();

      // S-279 AC5: the customer's tracking page shows it paid and confirmed.
      await page.goto(`/t/${token}`);
      await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("Paid", { exact: true })).toBeVisible();
      await expect(page.getByText("Payment received, thank you")).toBeVisible();
      await expect(page.getByRole("region", { name: "Pay now to confirm your order" })).toHaveCount(0);
      await expect(page.getByRole("region", { name: "Progress" }).getByText("Step 3 of 6: Approved")).toBeVisible();
      expect(await db`select template from email_outbox where order_id = ${order!.id} and template = 'order_confirmed'`).toEqual([{ template: "order_confirmed" }]);
      await accessible(page);
      if (isPhone375()) await page.screenshot({ path: `${SHOTS}/juice-tracking-paid.png`, fullPage: true });
    });
  });

  test("AC2: an order unpaid 24 hours after its APPROVAL is cancelled by the hourly job (not 24 hours after placing); admin and tracking say so", async ({ page, browser, baseURL, db }) => {
    const order = await createOrder(db, `Unpaid ${test.info().project.name}`);
    // Placed long before any other spec's clock, so the job runs below touch this order only.
    // Placed at 00:00Z and approved at 06:00Z on 1 Jan: the clock runs from the approval.
    await db`update orders set status = 'awaiting_payment', created_at = '2026-01-01T00:00:00Z', awaiting_payment_since = '2026-01-01T06:00:00Z' where id = ${order.id}`;
    const tick = async (now: string) => {
      const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
      await client.connect();
      try {
        expect(await paymentDeadlines({ now: new Date(now), db: drizzle(client) } as unknown as JobContext)).toMatchObject({ ran: true });
      } finally {
        await client.end();
      }
      return (await db<{ status: string; cancel_reason: string | null }[]>`select status, cancel_reason from orders where id = ${order.id}`)[0];
    };

    // 29.5 h after placing, 23.5 h after approval: still waiting (its 12 h reminder is queued).
    expect(await tick("2026-01-02T05:30:00Z")).toEqual({ status: "awaiting_payment", cancel_reason: null });
    expect((await db<{ sent: boolean }[]>`select payment_reminder_sent_at is not null as sent from orders where id = ${order.id}`)[0]).toEqual({ sent: true });
    // 24.5 h after approval: cancelled as unpaid, the date is free again.
    expect(await tick("2026-01-02T06:30:00Z")).toEqual({ status: "cancelled", cancel_reason: "unpaid" });

    await page.goto(`/t/${order.trackingToken}`);
    await expect(page.getByText("Cancelled: we did not receive the payment within 24 hours")).toBeVisible();
    await expectNoA11yViolations(page);

    const phone = await browser.newContext({ viewport: page.viewportSize()! });
    await setClock(phone, baseURL!, "2026-01-02T08:00:00Z");
    const owner = await phone.newPage();
    await signIn(owner, E2E_ACCOUNTS.owner, `/admin/orders/${order.id}`);
    await expect(owner.getByText("Cancelled: unpaid").first()).toBeVisible();
    await owner.goto("/admin/orders?tab=payment");
    const cancelled = owner.getByRole("region", { name: "Cancelled: unpaid (last 7 days)" });
    await expect(cancelled.getByRole("link", { name: `Order ${numberOf(order.number)}`, exact: true })).toBeVisible();
    await phone.close();
  });

  test("AC3: a French order gets French instructions and a French WhatsApp message", async ({ page, db }) => {
    const order = await createOrder(db, `Juice FR ${test.info().project.name}`);
    // Approved (approve, then pay): it now waits for its payment.
    await db`update orders set status = 'awaiting_payment', locale = 'fr', created_at = '2026-11-20T04:00:00Z', awaiting_payment_since = '2026-11-20T06:00:00Z' where id = ${order.id}`;
    await withJuiceSettings(db, async () => {
      await page.goto(`/fr/t/${order.trackingToken}`);
      const card = page.getByRole("region", { name: "Payez maintenant pour confirmer votre commande" });
      await expect(card.getByText(`Payez Rs 850 par Juice à E2E Baker (5000 0071), référence ${numberOf(order.number)}.`)).toBeVisible();
      await expect(card.getByText("Comment payer")).toBeVisible();
      const href = await card.getByRole("link", { name: /Envoyer la preuve sur WhatsApp/ }).getAttribute("href");
      expect(decodeURIComponent(href!.split("text=")[1]!)).toBe(`Bonjour, voici la preuve de mon paiement Juice pour la commande ${numberOf(order.number)} (Rs 850).`);
      await expect(page.getByText("Étape 2 sur 6 : En attente de paiement")).toBeVisible();
      await expect(card.getByText("Merci de payer avant le sam. 21 nov., 10:00. Les commandes non payées sous 24 heures après leur validation sont annulées.")).toBeVisible();
      await expectNoA11yViolations(page);
    });
  });
});
