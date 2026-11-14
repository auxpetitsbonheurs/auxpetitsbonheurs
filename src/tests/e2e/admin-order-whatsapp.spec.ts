// E-10 S-203: the WhatsApp menu on an order (keyboard, phone widths, axe), and S-201 AC7 / S-203
// AC6 access. The links are wa.me URLs: the spec reads them, it never opens WhatsApp.
import { expectNoA11yViolations, expectNoHorizontalScroll, expectNothingClipped, expectTapTargets } from "./support/a11y";
import { signIn } from "./support/admin";
import { E2E_ACCOUNTS, createOrder } from "./support/database";
import { expect, test } from "./support/fixtures";

const SHOTS = "/tmp/claude-0/-home-user-auxpetitsbonheurs/9106cb54-2393-55df-a3cb-bd8500903b6a/scratchpad";

test.describe("S-203 order WhatsApp menu", () => {
  test("AC1 + AC5 + AC7 + AC8: the menu opens from the keyboard, arrows move, Escape returns focus; each item is a prefilled wa.me link in the order's language", async ({ page, db }, testInfo) => {
    const order = await createOrder(db, "Zoé Menu");
    await db`update orders set locale = 'fr' where id = ${order.id}`;
    await signIn(page, E2E_ACCOUNTS.owner, `/admin/orders/${order.id}`);
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");

    const trigger = page.getByRole("button", { name: /^WhatsApp/ });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu");
    const items = menu.getByRole("menuitem");
    await expect(items).toHaveCount(6);
    await expect(items.first()).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(items.nth(1)).toBeFocused();
    await page.keyboard.press("End");
    await expect(items.nth(5)).toBeFocused();

    const href = (await items.first().getAttribute("href")) ?? "";
    const url = new URL(href);
    expect(url.host).toBe("wa.me");
    expect(url.searchParams.get("text")).toMatch(/^Bonjour Zoé, votre commande APB-\d{4}/);
    await expect(items.first()).toHaveAttribute("target", "_blank");

    await expectNoHorizontalScroll(page);
    await expectNothingClipped(page);
    await expectTapTargets(page);
    await expectNoA11yViolations(page);
    if (testInfo.project.name === "phone-375") await page.screenshot({ path: `${SHOTS}/alerts-order-whatsapp-menu-375.png` });

    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("AC2: no usable phone: the button is disabled and the reason is written out", async ({ page, db }) => {
    const order = await createOrder(db, "No Phone");
    await db`update orders set contact_phone = '' where id = ${order.id}`;
    await signIn(page, E2E_ACCOUNTS.owner, `/admin/orders/${order.id}`);

    const trigger = page.getByRole("button", { name: /^WhatsApp/ });
    await expect(trigger).toHaveAttribute("aria-disabled", "true");
    const hint = await trigger.getAttribute("aria-describedby");
    await expect(page.locator(`#${hint}`)).toBeVisible();
  });

  test("AC6: an anonymous visitor is sent to the admin login with no order data", async ({ page, db }) => {
    const order = await createOrder(db, "Private Order");
    await page.goto(`/admin/orders/${order.id}`);
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.getByText("Private Order")).toHaveCount(0);
  });
});
