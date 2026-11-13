// E-08 journey J5 end to end (S-155, S-156, S-157, S-158, S-159, S-161), at 320, 375 and 1280
// px: a customer sends a request with a photo; an admin finds it in To review, looks at the
// photo, sends a quote; the customer accepts it on the tracking page (Juice payment follows)
// or declines it behind a confirm dialog. Each test makes its own request (own IP, own email).
import { fileURLToPath } from "node:url";
import { expectNoA11yViolations, expectNoHorizontalScroll, expectTapTargets, withZoom } from "./support/a11y";
import { signIn } from "./support/admin";
import { chooseDate } from "./support/checkout-date";
import { setClock } from "./support/clock";
import { E2E_ACCOUNTS } from "./support/database";
import { type Page, expect, test } from "./support/fixtures";

const JPEG = fileURLToPath(new URL("./fixtures/cake-exif.jpg", import.meta.url));
/** Thu 5 Nov 2026, 12:00 MU: Thu 12 Nov is orderable; the default quote expiry is Tue 10 Nov. */
const NOW = "2026-11-05T08:00:00Z";
const ADMIN = E2E_ACCOUNTS.helper;

const hydrated = (page: Page) => expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");

test.beforeEach(async ({ context, baseURL }) => {
  await setClock(context, baseURL!, NOW);
});

/** Sends a request (with one photo unless told not to) and returns its tracking token and order id. */
async function sendRequest(page: Page, db: Parameters<Parameters<typeof test>[2]>[0]["db"], options: { photo?: boolean } = {}) {
  await page.goto("/custom-cake");
  await hydrated(page);
  await page.getByLabel("Occasion").selectOption("wedding");
  await page.getByLabel("Number of people").fill("80");
  await page.getByLabel("Flavours").fill("Vanilla and raspberry");
  await page.getByLabel(/^Anything else we should know/).fill("Three tiers, white flowers.");
  await page.getByRole("radio", { name: /^Pickup/ }).check();
  await chooseDate(page, "2026-11-12");
  await page.getByRole("radio", { name: /^Morning/ }).locator("visible=true").check();
  await page.getByLabel("Name", { exact: true }).fill("E2E Quote Customer");
  await page.getByLabel("Phone", { exact: true }).fill("5712 3456");
  await page.getByLabel("Email", { exact: true }).fill(`quote-${test.info().testId}-${Date.now()}@e2e.test`);
  await page.getByRole("checkbox", { name: "I accept the order policies" }).check();
  if (options.photo !== false) {
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Add photos (up to 5)" }).click();
    await (await chooser).setFiles(JPEG);
    await expect(page.locator('input[name="photoPaths"]')).toHaveCount(1, { timeout: 20_000 });
  }
  await page.getByRole("button", { name: "Send my request" }).click();
  await expect(page).toHaveURL(/\/order\/[A-Za-z0-9_-]{43}\/confirmed$/);
  const token = /\/order\/([A-Za-z0-9_-]{43})\//.exec(page.url())![1]!;
  const [order] = await db<{ id: string; number: number }[]>`select id, number from orders where tracking_token = ${token}`;
  return { token, id: order!.id, number: `APB-${String(order!.number).padStart(4, "0")}` };
}

async function sendQuote(page: Page, orderId: string, amount: string) {
  await page.goto(`/admin/orders/${orderId}`);
  await hydrated(page);
  await page.getByRole("button", { name: "Send quote" }).click();
  const sheet = page.getByRole("dialog", { name: "Send quote" });
  await expect(sheet).toBeVisible();
  await sheet.getByLabel("Price for the whole order (Rs)").fill(amount);
  await sheet.getByLabel("Note to the customer (optional)").fill("Three tiers with fresh flowers.");
  await expect(sheet.getByLabel("Valid until")).toHaveValue("2026-11-10");
  await sheet.getByRole("button", { name: "Send quote" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Quote sent" })).toBeVisible();
}

test("J5, S-155 AC2/AC8, S-156 AC1/AC8, S-158 AC1/AC2/AC9: request -> To review -> photo -> quote -> accept -> Juice payment", async ({ page, browser, baseURL, db }) => {
  const request = await sendRequest(page, db);

  // Admin, in their own browser: To review lists it as Quote needed; the photo opens in a dialog.
  const admin = await browser.newContext({ baseURL });
  await setClock(admin, baseURL!, NOW);
  const adminPage = await admin.newPage();
  await signIn(adminPage, ADMIN, "/admin/orders?tab=review");
  // Oldest first, 30 a page: parallel tests may push this one to a later page, so open it by its link.
  await expect(adminPage.getByRole("listitem").filter({ hasText: "Waiting for our quote" }).first()).toBeVisible();
  await adminPage.goto(`/admin/orders/${request.id}`);
  await hydrated(adminPage);
  await expect(adminPage.getByText("Quote needed").first()).toBeVisible();
  await expect(adminPage.getByRole("heading", { level: 2, name: "Custom request" })).toBeVisible();
  await expect(adminPage.getByText("Vanilla and raspberry")).toBeVisible();
  const open = adminPage.getByRole("button", { name: "Open photo 1 of 1" });
  await open.click();
  const lightbox = adminPage.getByRole("dialog", { name: "Photo 1 of 1" });
  await expect(lightbox.getByRole("img", { name: "Reference photo 1" })).toBeVisible();
  await adminPage.keyboard.press("Escape");
  await expect(lightbox).toBeHidden();
  await expect(open).toBeFocused();
  await sendQuote(adminPage, request.id, "4500");
  await expect(adminPage.getByRole("button", { name: "Send a new quote" })).toBeVisible();
  await admin.close();

  // Customer: the quote with Accept and Decline; Accept leads to the Juice payment.
  await page.goto(`/t/${request.token}`);
  await hydrated(page);
  await expect(page.getByRole("heading", { level: 2, name: "Your quote" })).toBeVisible();
  await expect(page.getByText("Rs 4,500", { exact: true })).toBeVisible();
  await expect(page.getByText(/^Valid until /)).toBeVisible();
  await page.getByRole("button", { name: "Accept quote of Rs 4,500" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Thank you, quote accepted" })).toBeFocused();
  await expect(page.getByTestId("payment-instructions").or(page.getByTestId("payment-fallback"))).toBeVisible();
  await expect(page.getByRole("button", { name: /^Accept quote/ })).toHaveCount(0);
  const [order] = await db<{ status: string; total_rs: number }[]>`select status, total_rs from orders where id = ${request.id}`;
  expect(order).toEqual({ status: "awaiting_payment", total_rs: 4500 });
});

test("S-159 AC2: Decline asks first; Keep the quote changes nothing; confirming closes the request", async ({ page, browser, baseURL, db }) => {
  const request = await sendRequest(page, db, { photo: false });
  const admin = await browser.newContext({ baseURL });
  await setClock(admin, baseURL!, NOW);
  const adminPage = await admin.newPage();
  await signIn(adminPage, ADMIN, `/admin/orders/${request.id}`);
  await sendQuote(adminPage, request.id, "3200");
  await admin.close();

  await page.goto(`/t/${request.token}`);
  await hydrated(page);
  await page.getByRole("button", { name: "Decline quote" }).click();
  const dialog = page.getByRole("dialog", { name: "Decline this quote?" });
  await expect(dialog.getByRole("button", { name: "Keep the quote" })).toBeFocused();
  await dialog.getByRole("button", { name: "Keep the quote" }).click();
  await expect(dialog).toBeHidden();
  expect((await db<{ status: string }[]>`select status from orders where id = ${request.id}`)[0]!.status).toBe("quote_sent");

  await page.getByRole("button", { name: "Decline quote" }).click();
  await page.getByRole("dialog", { name: "Decline this quote?" }).getByRole("button", { name: "Yes, decline" }).click();
  await expect(page).toHaveURL(/declined=1$/);
  expect((await db<{ status: string }[]>`select status from orders where id = ${request.id}`)[0]!.status).toBe("closed");
  await expect(page.getByRole("button", { name: /^(Accept|Decline) quote/ })).toHaveCount(0);
});

test("S-157 AC1: Refuse with a reason declines the request", async ({ page, db }) => {
  const request = await sendRequest(page, db, { photo: false });
  await signIn(page, ADMIN, `/admin/orders/${request.id}`);
  await hydrated(page);
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("button", { name: "Refuse order" }).click();
  const dialog = page.getByRole("dialog", { name: `Refuse order ${request.number}?` });
  await dialog.getByLabel("Reason for the customer").fill("We are fully booked that day.");
  await dialog.getByRole("button", { name: `Refuse order ${request.number}` }).click();
  await expect(page.getByRole("status").filter({ hasText: `Order ${request.number} refused.` })).toBeVisible();
  const [order] = await db<{ status: string; decline_reason: string }[]>`select status, decline_reason from orders where id = ${request.id}`;
  expect(order).toEqual({ status: "declined", decline_reason: "We are fully booked that day." });
});

test("S-155 AC8, S-156 AC9, S-158 AC9/AC10: admin request screen with the sheet open, and the quote page, pass axe at every width and 200% zoom", async ({ page, browser, baseURL, db }) => {
  const request = await sendRequest(page, db);
  const admin = await browser.newContext({ baseURL });
  await setClock(admin, baseURL!, NOW);
  const adminPage = await admin.newPage();
  await signIn(adminPage, ADMIN, `/admin/orders/${request.id}`);
  await hydrated(adminPage);
  await expectNoA11yViolations(adminPage);
  await expectNoHorizontalScroll(adminPage);
  await withZoom(adminPage, 2, () => expectNoHorizontalScroll(adminPage));
  await adminPage.getByRole("button", { name: "Send quote" }).click();
  const sheet = adminPage.getByRole("dialog", { name: "Send quote" });
  await sheet.getByRole("button", { name: "Send quote" }).click();
  await expect(sheet.getByText("Enter a price from Rs 1 to Rs 1,000,000")).toBeVisible();
  await expect(sheet.getByLabel("Price for the whole order (Rs)")).toHaveAccessibleDescription(/Enter a price from Rs 1 to Rs 1,000,000/);
  await expectNoA11yViolations(adminPage);
  await sheet.getByLabel("Price for the whole order (Rs)").fill("4500");
  await sheet.getByRole("button", { name: "Send quote" }).click();
  await expect(adminPage.getByRole("status").filter({ hasText: "Quote sent" })).toBeVisible();
  await admin.close();

  await page.goto(`/fr/t/${request.token}`);
  await hydrated(page);
  await expect(page.getByRole("button", { name: "Accepter le devis de Rs 4,500" })).toBeVisible();
  await expectNoA11yViolations(page);
  await expectTapTargets(page);
  await expectNoHorizontalScroll(page);
  await withZoom(page, 2, () => expectNoHorizontalScroll(page));
});
