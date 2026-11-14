// Test fixture (S-127): an invoice document with PLACEHOLDER business values only. The repository is
// public: never put the client's real name, BRN, address, phone or bank details in tests.
import { type InvoiceDocument, eventDateParts, invoiceTotals } from "~/domain/invoice";
import { invoiceLabels } from "~/server/services/invoice.server";

export const PLACEHOLDER_BUSINESS = {
  legalName: "Example Bakery Ltd",
  brn: "C00000000",
  address: "1 Example Street\nExample Town",
  phone: "+230 5000 0000",
  bankName: "Example Bank Ltd",
  accountName: "Example Account Holder",
  accountNumber: "000000000000",
  juiceNumber: "+230 5000 0000",
} as const;

export function sampleInvoice(overrides: Partial<InvoiceDocument> & { paid?: boolean } = {}): InvoiceDocument {
  const { paid = false, ...rest } = overrides;
  const locale = rest.locale ?? "en";
  const lines = rest.lines ?? [
    { quantity: 1, description: "2 tier cake", details: ["Vanilla sponge", "Message: “Happy birthday Zoé”"], unitRs: 5200, totalRs: 5200 },
    { quantity: null, description: locale === "fr" ? "Livraison" : "Delivery", details: [], unitRs: 150, totalRs: 150 },
  ];
  const totalRs = lines.reduce((sum, line) => sum + line.totalRs, 0);
  return {
    number: 1108,
    date: "2026-11-05",
    locale,
    fileName: "Invoice-1108.pdf",
    labels: invoiceLabels(locale),
    business: { legalName: PLACEHOLDER_BUSINESS.legalName, brn: PLACEHOLDER_BUSINESS.brn, address: PLACEHOLDER_BUSINESS.address.split("\n"), phone: PLACEHOLDER_BUSINESS.phone },
    billTo: "Jenny Example",
    eventDate: eventDateParts("2026-11-05", locale),
    instructions: [locale === "fr" ? "Livraison" : "Delivery", "2 Example Road, Example Town"],
    lines,
    discountLabel: null,
    totals: invoiceTotals({ lines, discountRs: 0, totalRs, paid }),
    payment: { bankName: PLACEHOLDER_BUSINESS.bankName, accountName: PLACEHOLDER_BUSINESS.accountName, accountNumber: PLACEHOLDER_BUSINESS.accountNumber, juiceNumber: PLACEHOLDER_BUSINESS.juiceNumber },
    terms: locale === "fr" ? ["Paiement intégral par Juice avant la livraison/le retrait"] : ["Full payment by Juice before delivery/pickup"],
    thankYou: locale === "fr" ? "Merci d'avoir choisi Aux petits bonheurs !" : "Thank you for choosing Aux petits bonheurs!",
    ...rest,
  };
}
