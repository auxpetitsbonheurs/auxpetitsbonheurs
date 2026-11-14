// S-127: the Invoice section of Settings (Owner only): placeholder values only (public repository).
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import type { Database } from "~/server/db.server";
import { assignInvoiceNumber } from "~/server/repos/invoice.server";
import { signedInAdmin } from "~/server/testing/admin-session";
import { placeTestOrder } from "~/server/testing/orders";
import { routeArgs } from "~/server/testing/route-context";
import { loadedSettingsForm } from "~/server/testing/settings-form";
import { loader as privacyLoader } from "../site/privacy";
import { action, loader } from "./settings";

let database: TestDatabase;

beforeEach(async () => {
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  await database.close();
});

type Answer = { ok: true; version: number } | { data: { ok: false; error: { code: string; fields?: Record<string, string> } } };

async function save(overrides: Record<string, string | string[]> = {}, role: "owner" | "admin" = "owner"): Promise<Answer> {
  const session = await signedInAdmin(database, { role });
  const form = await loadedSettingsForm(database, overrides);
  try {
    return (await action(routeArgs(database, { path: "/admin/settings", auth: session.auth, cookie: session.cookie, form }) as never)) as Answer;
  } catch (thrown) {
    return thrown as Answer;
  }
}

const fieldsOf = (answer: Answer) => ("data" in answer ? answer.data.error.fields : undefined);

async function stored() {
  const { rows } = await database.client.query<Record<string, unknown>>(
    "select invoice_legal_name, invoice_brn, invoice_address, invoice_phone, bank_name, bank_account_name, bank_account_number, invoice_payment_terms, invoice_thank_you, next_invoice_number from settings",
  );
  return rows[0]!;
}

const PLACEHOLDERS = {
  invoiceLegalName: "Example Bakery Ltd",
  invoiceBrn: "c00000000",
  invoiceAddress: "1 Example Street\nExample Town",
  invoicePhone: "+230 5000 0000",
  bankName: "Example Bank Ltd",
  bankAccountName: "Example Account Holder",
  bankAccountNumber: "000 000 000 000",
};

describe("S-127 Invoice settings", () => {
  test("the page loads the defaults: full-payment terms in EN and FR, the thank-you line and next number 1108", async () => {
    const session = await signedInAdmin(database, { role: "owner" });
    const page = await loader(routeArgs(database, { path: "/admin/settings", auth: session.auth, cookie: session.cookie }) as never);

    expect(page.settings.invoice).toEqual({
      legalName: null,
      brn: null,
      address: null,
      phone: null,
      bankName: null,
      bankAccountName: null,
      bankAccountNumber: null,
      paymentTerms: { en: "Full payment by Juice before delivery/pickup", fr: "Paiement intégral par Juice avant la livraison/le retrait" },
      thankYou: { en: "Thank you for choosing Aux petits bonheurs!", fr: "Merci d'avoir choisi Aux petits bonheurs !" },
      nextNumber: 1108,
    });
  });

  test("the Owner saves the business and bank details; the BRN is upper-cased", async () => {
    expect(await save(PLACEHOLDERS)).toMatchObject({ ok: true });

    expect(await stored()).toMatchObject({
      invoice_legal_name: "Example Bakery Ltd",
      invoice_brn: "C00000000",
      invoice_address: "1 Example Street\nExample Town",
      bank_account_number: "000 000 000 000",
      next_invoice_number: 1108,
    });
  });

  test("an Admin who is not the Owner cannot save Settings", async () => {
    const answer = (await save(PLACEHOLDERS, "admin")) as unknown as { init?: { status: number } };
    expect(answer.init?.status).toBe(403);
    expect((await stored()).invoice_legal_name).toBeNull();
  });

  test.each([
    ["bankAccountNumber", "12-34-5678"],
    ["bankAccountNumber", "000  000 000"],
    ["invoiceBrn", "C 000"],
    ["invoicePhone", "call me"],
    ["invoiceNextNumber", "11o8"],
    ["invoiceLegalName", "x".repeat(121)],
  ])("%s %j is refused with a message and nothing is saved", async (field, value) => {
    const answer = await save({ [field]: value });

    expect(fieldsOf(answer)?.[field]).toEqual(expect.any(String));
    expect((await stored()).invoice_legal_name).toBeNull();
  });

  test("terms in French alone are refused (English first, like the other texts)", async () => {
    expect(fieldsOf(await save({ "invoicePaymentTerms.en": "", "invoicePaymentTerms.fr": "Paiement" }))?.["invoicePaymentTerms.en"]).toEqual(expect.any(String));
  });

  test("the Owner can move the next number forward", async () => {
    await save({ invoiceNextNumber: "2000" });
    expect((await stored()).next_invoice_number).toBe(2000);
  });

  test("a next number already used is refused, naming the lowest one allowed", async () => {
    const placed = await placeTestOrder(database);
    const { rows } = await database.client.query<{ id: string }>("select id from orders where tracking_token = $1", [placed.token]);
    await assignInvoiceNumber(database.db as unknown as Database, rows[0]!.id, "2026-11-06");
    await database.client.query("update settings set next_invoice_number = 1109");

    const answer = await save({ invoiceNextNumber: "1108", invoiceNextNumberWas: "1109" });

    expect(fieldsOf(answer)?.invoiceNextNumber).toBe("That number is already used. Enter 1109 or more.");
    expect((await stored()).next_invoice_number).toBe(1109);
  });

  test("an unchanged next number never turns the counter back after an invoice was made meanwhile", async () => {
    const form = await loadedSettingsForm(database); // loaded with 1108
    const placed = await placeTestOrder(database);
    const { rows } = await database.client.query<{ id: string }>("select id from orders where tracking_token = $1", [placed.token]);
    await assignInvoiceNumber(database.db as unknown as Database, rows[0]!.id, "2026-11-06"); // counter now 1109

    expect(await save({ invoiceNextNumber: form.invoiceNextNumber as string, invoiceNextNumberWas: form.invoiceNextNumberWas as string, invoiceLegalName: "Example Bakery Ltd" })).toMatchObject({ ok: true });

    expect(await stored()).toMatchObject({ next_invoice_number: 1109, invoice_legal_name: "Example Bakery Ltd" });
  });
});

describe("S-127: the privacy note reads the legal name, BRN and address from these Settings", () => {
  const privacy = async () => privacyLoader(routeArgs(database, { path: "/privacy" }) as never);

  test("empty Settings keep the to-be-confirmed placeholders", async () => {
    const page = await privacy();
    expect(page.facts).toMatchObject({ legalName: null, brn: null, address: null });
    expect(page.open).toBe(true);
  });

  test("saved Settings fill the note on the next request (the cache is cleared by the save)", async () => {
    await privacy();
    await save(PLACEHOLDERS);

    expect((await privacy()).facts).toMatchObject({ legalName: "Example Bakery Ltd", brn: "C00000000", address: "1 Example Street, Example Town" });
  });
});
