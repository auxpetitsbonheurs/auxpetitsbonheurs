// S-127 invoices: one tap in More actions gives a real PDF (built in the browser) named
// Invoice-<n>.pdf whose text holds the number and the total; the number is taken once, never
// twice, on a real Postgres; the JSON is admin-only; the printable page and the Owner's Invoice
// settings pass axe. Placeholder values only: the repository is public.
import { readFile } from "node:fs/promises";
import { pdfText } from "../../app/server/testing/pdf-text";
import { expectNoA11yViolations, expectNoHorizontalScroll, expectTapTargets } from "./support/a11y";
import { signIn } from "./support/admin";
import { E2E_ACCOUNTS, type TestOrder, createOrder } from "./support/database";
import { type Page, expect, test } from "./support/fixtures";
import { withSettingsLock } from "./support/settings-lock";

const SHOTS = "/tmp/claude-0/-home-user-auxpetitsbonheurs/9106cb54-2393-55df-a3cb-bd8500903b6a/scratchpad";

type Db = Parameters<typeof createOrder>[0];

/** A delivery order with one cake line (Rs 1,200) and a Rs 150 fee. */
async function cakeOrder(db: Db, label: string): Promise<TestOrder> {
  const order = await createOrder(db, label);
  await db`update orders set status = 'approved', fulfilment = 'delivery', address = '2 Example Road, Example Town', items_total_rs = 1200, delivery_fee_rs = 150, total_rs = 1350 where id = ${order.id}`;
  await db`insert into order_item (order_id, name_en, name_fr, original_base_price_rs, unit_base_price_rs, quantity, line_total_rs, cake_message)
    values (${order.id}, 'Lemon tart', 'Tarte au citron', 1200, 1200, 1, 1200, 'Happy birthday')`;
  return order;
}

async function openOrder(page: Page, order: TestOrder) {
  await signIn(page, E2E_ACCOUNTS.owner, `/admin/orders/${order.id}`);
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
}

async function openInvoiceDialog(page: Page) {
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("button", { name: "Download invoice" }).click();
}

async function invoiceNumberOf(db: Db, order: TestOrder): Promise<number | null> {
  const [row] = await db<{ invoice_number: number | null }[]>`select invoice_number from orders where id = ${order.id}`;
  return row?.invoice_number ?? null;
}

test.describe("S-127 Download invoice", () => {
  test("one tap: Preparing invoice…, then Invoice-<n>.pdf whose text has the number and the total; the order page stays", async ({ page, db }) => {
    const order = await cakeOrder(db, "Invoice Download");
    await openOrder(page, order);
    // Hold the data a moment so the instant feedback can be seen.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/invoice.json", async (route) => {
      await held;
      await route.continue();
    });

    await openInvoiceDialog(page);
    const dialog = page.getByRole("dialog", { name: "Invoice" });
    await expect(dialog.getByRole("status")).toHaveText("Preparing invoice…");
    const downloading = page.waitForEvent("download");
    release();
    const download = await downloading;

    const number = await invoiceNumberOf(db, order);
    expect(number).not.toBeNull();
    expect(download.suggestedFilename()).toBe(`Invoice-${number}.pdf`);
    const bytes = await readFile(await download.path());
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    const { text, strings } = await pdfText(new Uint8Array(bytes));
    expect(strings).toContain(`INVOICE NO. ${number}`);
    expect(strings).toEqual(expect.arrayContaining(["Lemon tart", "Delivery", "TOTAL DUE", "Rs 1,350"]));
    expect(text).toContain("Full payment by Juice before delivery/pickup");

    await expect(dialog.getByRole("status")).toHaveText(`Invoice-${number}.pdf is ready.`);
    await expect(dialog.getByRole("button", { name: "Download again" })).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Open printable invoice" })).toHaveAttribute("href", `/admin/orders/${order.id}/invoice`);
    await expectTapTargets(page);
    await expectNoA11yViolations(page);
    if (test.info().project.name === "phone-375") await page.screenshot({ path: `${SHOTS}/invoice-dialog-ready-375.png` });

    // Again: the same number (regeneration keeps it).
    await page.getByRole("button", { name: "Close" }).click();
    const again = page.waitForEvent("download");
    await openInvoiceDialog(page);
    expect((await again).suggestedFilename()).toBe(`Invoice-${number}.pdf`);
    expect(await invoiceNumberOf(db, order)).toBe(number);
    await expect(page.getByTestId("order-content")).toBeVisible();
  });

  test("a paid French order: FACTURE N°, the downpayment is Payé, the balance Rs 0 and PAYÉ is stamped", async ({ page, db }) => {
    const order = await cakeOrder(db, "Invoice Paid");
    await db`update orders set locale = 'fr', paid = true where id = ${order.id}`;
    await openOrder(page, order);
    const downloading = page.waitForEvent("download");
    await openInvoiceDialog(page);
    const { strings } = await pdfText(new Uint8Array(await readFile(await (await downloading).path())));

    expect(strings).toEqual(expect.arrayContaining([`FACTURE N° ${await invoiceNumberOf(db, order)}`, "RESTE À PAYER", "Payé Rs 1,350", "Rs 0", "PAYÉ", "Tarte au citron"]));
  });

  test("a failure is calm: the message, Try again and the printable page; the order page stays", async ({ page, db }) => {
    const order = await cakeOrder(db, "Invoice Offline");
    await openOrder(page, order);
    let fail = true;
    await page.route("**/invoice.json", (route) => (fail ? route.abort("internetdisconnected") : route.continue()));

    await openInvoiceDialog(page);
    const dialog = page.getByRole("dialog", { name: "Invoice" });
    await expect(dialog.getByRole("alert")).toContainText("The invoice could not be prepared.");
    await expect(page.getByTestId("order-content")).toBeAttached();
    await expectNoA11yViolations(page);

    fail = false;
    const downloading = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Try again" }).click();
    expect((await downloading).suggestedFilename()).toMatch(/^Invoice-\d+\.pdf$/);
  });

  test("parallel first invoices on a real Postgres: distinct numbers, and one order keeps one number", async ({ page, db }) => {
    const orders = await Promise.all([1, 2, 3, 4].map((i) => cakeOrder(db, `Invoice Race ${i}`)));
    await signIn(page, E2E_ACCOUNTS.owner, "/admin");
    const fetchNumber = async (order: TestOrder) => {
      const response = await page.request.get(`/admin/orders/${order.id}/invoice.json`);
      expect(response.status()).toBe(200);
      return ((await response.json()) as { invoice: { number: number } }).invoice.number;
    };

    const numbers = await Promise.all([...orders, orders[0]!, orders[0]!].map(fetchNumber));

    expect(new Set(numbers.slice(0, 4)).size).toBe(4);
    expect(numbers[4]).toBe(numbers[0]);
    expect(numbers[5]).toBe(numbers[0]);
    const stored = await db<{ invoice_number: number }[]>`select invoice_number from orders where id in ${db(orders.map((o) => o.id))}`;
    expect(stored.map((r) => r.invoice_number).sort()).toEqual(numbers.slice(0, 4).sort());
  });

  test("admin only: signed out, the JSON and the printable page lead to sign-in and no number is taken", async ({ page, db }) => {
    const order = await cakeOrder(db, "Invoice Guard");

    const response = await page.request.get(`/admin/orders/${order.id}/invoice.json`, { maxRedirects: 0 });
    expect(response.status()).toBe(302);
    expect(response.headers()["location"]).toContain("/admin/login");
    await page.goto(`/admin/orders/${order.id}/invoice`);
    await expect(page).toHaveURL(/\/admin\/login/);
    expect(await invoiceNumberOf(db, order)).toBeNull();
  });

  test("the printable invoice: number, rows and totals; prints bare; no sideways scroll; axe clean", async ({ page, db }) => {
    const order = await cakeOrder(db, "Invoice Print");
    await signIn(page, E2E_ACCOUNTS.helper, `/admin/orders/${order.id}/invoice`);
    const number = await invoiceNumberOf(db, order);

    await expect(page.getByRole("heading", { level: 1 })).toContainText(`INVOICE NO. ${number}`);
    await expect(page.getByRole("cell", { name: /Lemon tart/ })).toBeVisible();
    await expect(page.getByText("Rs 1,350").last()).toBeVisible();
    await expect(page.getByRole("button", { name: "Print" })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectTapTargets(page);
    await expectNoA11yViolations(page);
    if (test.info().project.name === "phone-375") await page.screenshot({ path: `${SHOTS}/invoice-print-view-375.png`, fullPage: true });
    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("button", { name: "Print" })).toBeHidden();
  });
});

test.describe("S-127 Invoice settings (Owner)", () => {
  test("the section: every field, the full-payment default terms, an account number refused calmly, axe clean", async ({ page, db }, testInfo) => {
    await signIn(page, E2E_ACCOUNTS.owner, "/admin/settings");
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
    const section = page.getByRole("region", { name: "Invoice" });
    for (const name of ["Legal business name", "BRN (Business Registration Number)", "Address on invoices", "Invoice phone", "Bank name", "Account name", "Account number", "Next invoice number"]) {
      await expect(section.getByRole("textbox", { name: new RegExp(`^${name.replace(/[()]/g, "\\$&")}`) })).toBeVisible();
    }
    await expect(section.getByRole("textbox", { name: "Payment terms (English)" })).toHaveValue("Full payment by Juice before delivery/pickup");
    await expect(section.getByRole("textbox", { name: "Payment terms (French)" })).toHaveValue("Paiement intégral par Juice avant la livraison/le retrait");
    await expect(section).toContainText("The Juice number comes from Payment above.");
    await expectNoHorizontalScroll(page);
    await expectNoA11yViolations(page);
    if (testInfo.project.name === "phone-375") {
      await section.getByRole("textbox", { name: /^Legal business name/ }).fill("Example Bakery Ltd");
      await section.getByRole("textbox", { name: /^BRN/ }).fill("C00000000");
      await section.getByRole("textbox", { name: /^Account number/ }).fill("000000000000");
      await section.screenshot({ path: `${SHOTS}/invoice-settings-375.png` });
    }

    await withSettingsLock(db, async () => {
      const account = section.getByRole("textbox", { name: /^Account number/ });
      await account.fill("12-34-56");
      await page.getByRole("button", { name: "Save settings" }).click();
      const message = "Enter the account number as digits, with single spaces if you like (6 to 30 characters).";
      await page.getByRole("link", { name: message }).click();
      await expect(account).toBeFocused();
      await expect(account).toHaveAttribute("aria-invalid", "true");
      await expectNoA11yViolations(page);
    });
    const [row] = await db<{ bank_account_number: string | null }[]>`select bank_account_number from settings`;
    expect(row?.bank_account_number ?? null).not.toBe("12-34-56");
  });

  test("the legal name typed once in Settings shows on the privacy note, then the placeholder again when cleared", async ({ page, db }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1280", "one project is enough: it saves the shared Settings row");
    await signIn(page, E2E_ACCOUNTS.owner, "/admin/settings");
    await withSettingsLock(db, async () => {
      const name = page.getByRole("region", { name: "Invoice" }).getByRole("textbox", { name: /^Legal business name/ });
      await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
      await name.fill("Example Bakery Ltd");
      await page.getByRole("button", { name: "Save settings" }).click();
      await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
      await page.goto("/privacy");
      await expect(page.getByRole("main")).toContainText("Example Bakery Ltd");

      await page.goto("/admin/settings");
      await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
      await page.getByRole("region", { name: "Invoice" }).getByRole("textbox", { name: /^Legal business name/ }).fill("");
      await page.getByRole("button", { name: "Save settings" }).click();
      await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
      await page.goto("/privacy");
      await expect(page.getByRole("main")).not.toContainText("Example Bakery Ltd");
    });
  });
});
