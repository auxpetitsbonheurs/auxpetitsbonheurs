// S-127: the invoice PDF built in the browser, read back with pdf-lib (placeholder values only).
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { describe, expect, test } from "vitest";
import { INVOICE_BADGE_PATH } from "./brand";
import { buildInvoicePdf } from "./invoice-pdf";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { pdfText } from "~/server/testing/pdf-text";
import { sampleInvoice } from "~/server/testing/invoice-fixture";

describe("buildInvoicePdf (S-127)", () => {
  test("one A4 page with the business, number, date, columns, rows, totals and payment details", async () => {
    const { pages, strings, text } = await pdfText(await buildInvoicePdf(sampleInvoice()));

    expect(pages).toBe(1);
    expect(strings).toEqual(expect.arrayContaining(["EXAMPLE BAKERY LTD", "BRN: C00000000", "1 Example Street", "Phone +230 5000 0000", "INVOICE NO. 1108", "DATE: 05/11/2026"]));
    expect(strings).toEqual(expect.arrayContaining(["BILL TO", "EVENT DATE", "INSTRUCTIONS", "Jenny Example", "5", "th", " November 2026", "Delivery"]));
    expect(strings).toEqual(expect.arrayContaining(["QUANTITY", "DESCRIPTION", "UNIT PRICE RS", "TOTAL RS", "2 tier cake", "5,200", "150"]));
    expect(strings).toEqual(expect.arrayContaining(["SUBTOTAL", "Rs 5,350", "DOWNPAYMENT", "TOTAL DUE"]));
    expect(strings).toEqual(expect.arrayContaining(["Payment Details:", "Bank: Example Bank Ltd", "Acc. No: 000000000000", "Juice: +230 5000 0000", "Payment Terms:"]));
    expect(text).toContain("Message: “Happy birthday Zoé”");
    expect(text).toContain("Thank you for choosing Aux petits bonheurs!");
    expect(text).not.toContain("PAID ");
  });

  test("paid in full: the downpayment says Paid, nothing is due and PAID is stamped", async () => {
    const { strings } = await pdfText(await buildInvoicePdf(sampleInvoice({ paid: true })));

    expect(strings).toEqual(expect.arrayContaining(["Paid Rs 5,350", "Rs 0", "PAID"]));
  });

  test("French: FACTURE N°, FACTURER À, the French date and terms", async () => {
    const { strings } = await pdfText(await buildInvoicePdf(sampleInvoice({ locale: "fr" })));

    expect(strings).toEqual(expect.arrayContaining(["FACTURE N° 1108", "FACTURER À", "RESTE À PAYER", " novembre 2026", "Paiement intégral par Juice avant la livraison/le retrait"]));
  });

  test("a promotion and a hand-set total each get a line", async () => {
    const doc = sampleInvoice();
    const { strings } = await pdfText(
      await buildInvoicePdf({ ...doc, discountLabel: "Promotion: Spring sale", totals: { ...doc.totals, discountRs: 350, adjustmentRs: -100, totalRs: 4900, dueRs: 4900 } }),
    );

    expect(strings).toEqual(expect.arrayContaining(["PROMOTION: SPRING SALE", "– Rs 350", "ADJUSTMENT", "– Rs 100", "Rs 4,900"]));
  });

  test("characters the PDF fonts cannot print never break the file", async () => {
    const { text } = await pdfText(await buildInvoicePdf(sampleInvoice({ billTo: "Ana 🎂 Ŵalker 李" })));

    expect(text).toContain("Ana ? Walker ?");
  });

  test("a long order continues on a second page with the table header again", async () => {
    const lines = Array.from({ length: 40 }, (_, i) => ({ quantity: 1, description: `Cupcake ${i + 1}`, details: ["Chocolate"], unitRs: 100, totalRs: 100 }));
    const { pages, strings } = await pdfText(await buildInvoicePdf(sampleInvoice({ lines })));

    expect(pages).toBeGreaterThan(1);
    expect(strings.filter((s) => s === "QUANTITY").length).toBe(pages);
    expect(strings).toContain("Cupcake 40");
  });
});

describe("the Owner's badge on the invoice", () => {
  const badgePng = () => new Uint8Array(readFileSync(fileURLToPath(new URL(`../../public${INVOICE_BADGE_PATH}`, import.meta.url))));

  /** [width, height] of each colour image in the PDF, and whether it has a soft mask (transparency). */
  async function images(bytes: Uint8Array): Promise<[number, number, boolean][]> {
    const pdf = await PDFDocument.load(bytes);
    const name = (stream: PDFRawStream, key: string) => stream.dict.get(PDFName.of(key));
    return pdf.context
      .enumerateIndirectObjects()
      .map(([, object]) => object)
      .filter((object): object is PDFRawStream => object instanceof PDFRawStream && name(object, "Subtype") === PDFName.of("Image") && name(object, "ColorSpace") === PDFName.of("DeviceRGB"))
      .map((stream) => [Number(String(name(stream, "Width"))), Number(String(name(stream, "Height"))), stream.dict.has(PDFName.of("SMask"))]);
  }

  test("embeds the cream badge PNG at 300 px (with its transparency) and keeps the PDF small", async () => {
    const bytes = await buildInvoicePdf(sampleInvoice(), badgePng());

    expect(await images(bytes)).toEqual([[300, 300, true]]);
    expect(bytes.byteLength).toBeLessThan(250_000);
  });

  test("without the badge (it failed to load) the invoice is still complete, just without an image", async () => {
    const bytes = await buildInvoicePdf(sampleInvoice());

    expect(await images(bytes)).toEqual([]);
    expect((await pdfText(bytes)).strings).toContain("INVOICE NO. 1108");
  });
});
