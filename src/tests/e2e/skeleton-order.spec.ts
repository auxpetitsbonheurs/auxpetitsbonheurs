// Walking skeleton end to end (E-01): order as a guest, land on the confirmation, follow
// the tracking link, the Owner approves it on the admin order screen, and the customer
// sees the approval on reload (S-016 AC6, S-017).
import { signIn } from "./support/admin";
import { setClock } from "./support/clock";
import { E2E_ACCOUNTS, SAMPLE_PRODUCT } from "./support/database";
import { expect, test } from "./support/fixtures";

test("S-016 AC6: after the bakery approves, a reload shows Approved and the progress moves one step", async ({ page, context, browser, baseURL, db }) => {
  await setClock(context, baseURL!, "2026-11-20T06:00:00Z");
  await page.goto(`/menu/${SAMPLE_PRODUCT.slug}`);
  await page.getByRole("button", { name: "Add to basket" }).click();
  await expect(page).toHaveURL(/\/basket$/);
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
  await page.getByRole("radio", { name: /^Pickup/ }).check();
  await page.getByLabel("Date", { exact: true }).fill("2026-11-21");
  await page.getByRole("radio", { name: /^Morning/ }).locator("visible=true").check();
  await page.getByLabel("Name", { exact: true }).fill("Skeleton Guest");
  await page.getByLabel("Phone", { exact: true }).fill("5712 3456");
  await page.getByLabel("Email", { exact: true }).fill(`skeleton-${test.info().project.name}-${Date.now()}@e2e.test`);
  await page.getByRole("checkbox", { name: "I accept the order policies" }).check();
  await page.getByRole("button", { name: "Place order" }).click();

  await page.getByRole("link", { name: "Follow my order" }).click();
  await expect(page).toHaveURL(/\/t\/[A-Za-z0-9_-]{43}$/);
  const token = /\/t\/([A-Za-z0-9_-]{43})$/.exec(page.url())![1]!;
  const progress = page.getByRole("region", { name: "Progress" });
  await expect(progress.getByText("Step 1 of 5: Pending approval")).toBeVisible();
  await expect(progress.locator('[aria-current="step"]')).toHaveText(/Pending approval/);

  // The Owner approves on the admin order screen, on another phone (S-017 replaces the S-016 direct DB write).
  const [order] = await db<{ id: string }[]>`select id from orders where tracking_token = ${token}`;
  const owner = await browser.newPage();
  await signIn(owner, E2E_ACCOUNTS.owner, `/admin/orders/${order!.id}`);
  await expect(owner.locator("html")).toHaveAttribute("data-hydrated", "true");
  await owner.getByRole("button", { name: "Approve" }).click();
  await expect(owner.getByRole("status").filter({ hasText: "approved." })).toBeVisible();
  await owner.close();
  await page.reload();

  await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible();
  await expect(progress.getByText("Step 2 of 5: Approved")).toBeVisible();
  await expect(progress.locator('[aria-current="step"]')).toHaveText(/Approved/);
});
