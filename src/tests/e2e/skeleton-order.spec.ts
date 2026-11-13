// The walking skeleton end to end (E-01 success measure, S-018 AC6; also S-016 AC6).
// Runs in its own project before every other spec, so the database is still clean:
// a guest orders for delivery on a 375 px phone, a double click still makes one order
// (APB-0001) awaiting its Juice payment, the Owner signs in on a phone and marks Payment
// received (juice-payment spec: that confirms it), the activity log shows both steps and the
// customer's tracking page shows Approved.
import { chooseDate } from "./support/checkout-date";
import { signIn } from "./support/admin";
import { setClock } from "./support/clock";
import { E2E_ACCOUNTS, SAMPLE_PRODUCT } from "./support/database";
import { expect, test } from "./support/fixtures";

test("S-018 AC6, S-016 AC6, S-279: guest order to APB-0001, double click still one order, Owner marks it paid, log and tracking show it", async ({ page, context, browser, baseURL, db }) => {
  expect(page.viewportSize()?.width).toBe(375);
  expect(await db`select id from orders`).toEqual([]);

  // A guest orders for delivery.
  await setClock(context, baseURL!, "2026-11-20T06:00:00Z");
  await page.goto(`/menu/${SAMPLE_PRODUCT.slug}`);
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
  await page.getByRole("button", { name: "Add to basket" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Added to your basket" })).toBeVisible();
  await page.getByRole("link", { name: "View basket" }).click();
  await expect(page).toHaveURL(/\/basket$/);
  await page.getByRole("radio", { name: /^Delivery/ }).check();
  await page.getByLabel("Delivery address").fill("12 Royal Road, Rose Hill");
  await chooseDate(page, "2026-11-24");
  await page.getByRole("radio", { name: /^Morning/ }).locator("visible=true").check();
  await page.getByLabel("Name", { exact: true }).fill("Skeleton Guest");
  await page.getByLabel("Phone", { exact: true }).fill("5712 3456");
  await page.getByLabel("Email", { exact: true }).fill("skeleton-guest@e2e.test");
  await page.getByRole("checkbox", { name: "I accept the order policies" }).check();
  await page.getByRole("button", { name: "Place order" }).dblclick();

  // APB-0001 and a tracking link; the double click made one order.
  await expect(page).toHaveURL(/\/order\/[A-Za-z0-9_-]{43}\/confirmed$/);
  await expect(page.getByText("APB-0001", { exact: true })).toBeVisible();
  expect(await db`select number from orders`).toEqual([{ number: 1 }]);
  await page.getByRole("link", { name: "Follow my order" }).click();
  await expect(page).toHaveURL(/\/t\/[A-Za-z0-9_-]{43}$/);
  const progress = page.getByRole("region", { name: "Progress" });
  await expect(progress.getByText("Step 1 of 5: Awaiting payment")).toBeVisible();

  // The Owner signs in on a phone and marks the Juice payment received from the Payment list.
  const phone = await browser.newContext({ viewport: { width: 375, height: 667 } });
  // The same test clock as the guest, two hours later: the order's created time is the guest's clock.
  await setClock(phone, baseURL!, "2026-11-20T08:00:00Z");
  const owner = await phone.newPage();
  await signIn(owner, E2E_ACCOUNTS.owner, "/admin/orders?tab=payment");
  await owner.getByRole("link", { name: "Order APB-0001", exact: true }).click();
  await expect(owner.getByRole("heading", { level: 1, name: "Order APB-0001" })).toBeVisible();
  await expect(owner.locator("html")).toHaveAttribute("data-hydrated", "true");
  await owner.getByRole("button", { name: "Payment received" }).click();
  await owner.getByRole("button", { name: "Yes, payment received" }).click();
  await expect(owner.getByRole("status").filter({ hasText: "Order APB-0001 marked paid and confirmed." })).toBeVisible();

  // The log shows both steps, oldest first.
  const log = owner.getByRole("list", { name: "Activity" });
  await expect(log.getByRole("listitem")).toHaveText([/^Created by customer, \d{1,2} [A-Z][a-z]{2} \d{2}:\d{2}$/, /^Payment received, marked by E2E Owner, \d{1,2} [A-Z][a-z]{2} \d{2}:\d{2}$/]);
  await phone.close();

  // The customer's tracking page shows Approved after a reload.
  await page.reload();
  await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible();
  await expect(progress.getByText("Step 2 of 5: Approved")).toBeVisible();
  await expect(progress.locator('[aria-current="step"]')).toHaveText(/Approved/);
});
