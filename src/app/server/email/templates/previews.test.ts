// Email previews: `EMAIL_PREVIEW_DIR=/some/dir npx vitest run app/server/email/templates/previews`
// writes every email as `<key>.<locale>.html` (plus .txt) with an index page, for a browser or
// a screenshot. Local files only: nothing is sent. Skipped when the variable is not set.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { authEmail } from "./auth-emails";
import { ORDER_EMAIL_KEYS, type OrderEmailData, renderOrderEmail } from "./order-emails";

const dir = process.env.EMAIL_PREVIEW_DIR;
const SITE = "https://auxpetitsbonheurs.example";

function sample(locale: "en" | "fr"): OrderEmailData {
  return {
    siteUrl: SITE,
    locale,
    order: {
      number: "APB-0042",
      contactName: "Aisha Khan",
      status: "awaiting_payment",
      fulfilment: "delivery",
      address: "12 Rue des Fleurs, Quatre Bornes",
      landmark: "near the church",
      fulfilOn: "2026-11-14",
      window: { id: "w1", start: "09:00", end: "12:00", label: { en: "Morning 9:00-12:00", fr: "Matin 9 h-12 h" } },
      deliveryFeeRs: 150,
      totalRs: 1250,
      paid: false,
      refundDueRs: null,
      declineReason: "We are fully booked that day",
      trackingToken: "T".repeat(43),
      createdAt: new Date("2026-11-13T05:00:00Z"),
    },
    items: [
      { nameEn: "Chocolate cake", nameFr: "Gâteau au chocolat", quantity: 1, lineTotalRs: 950, options: [{ groupId: "g", group: { en: "Size", fr: "Taille" }, kind: "single", choice: { en: "Large (10 people)", fr: "Grand (10 personnes)" }, priceDeltaRs: 150 }], cakeMessage: "Happy birthday Maya" },
      { nameEn: "Vanilla cupcakes (box of 6)", nameFr: "Cupcakes vanille (boîte de 6)", quantity: 2, lineTotalRs: 150, options: [], cakeMessage: null },
    ],
    request: { occasion: "Wedding", servings: 40, theme: "Roses and gold", photoCount: 2, quoteAmountRs: 4800, quoteNote: "Includes the topper and delivery", quoteExpiresOn: "2026-11-20" },
    shop: { pickupAddress: "5 Bakery Lane, Curepipe", pickupMapUrl: "https://maps.example/bakery", juiceName: "Sarah B", juiceNumber: "5712 3456", paymentWhatsapp: "+23057123456", instagramUrl: "https://instagram.example/bakery" },
    payload: { why: "expired", previousDate: "2026-11-12", previousTotalRs: 1000 },
  };
}

describe.skipIf(!dir)("email previews", () => {
  test("writes every email in English and French", () => {
    mkdirSync(dir!, { recursive: true });
    const names: string[] = [];
    for (const locale of ["en", "fr"] as const) {
      for (const key of ORDER_EMAIL_KEYS) {
        const base = sample(locale);
        const status = key === "order_confirmed" || key === "order_updated" ? { status: "approved", paid: true } : key === "order_received" ? { status: "pending_approval" } : {};
        const data = { ...base, order: { ...base.order, ...status } };
        const email = renderOrderEmail(key, data);
        writeFileSync(join(dir!, `${key}.${locale}.html`), email.html);
        writeFileSync(join(dir!, `${key}.${locale}.txt`), `Subject: ${email.subject}\n\n${email.text}`);
        names.push(`${key}.${locale}`);
      }
      for (const kind of ["signup_confirm", "sign_in_link", "password_reset", "email_change", "invite"] as const) {
        const email = authEmail(kind, locale, `${SITE}/auth/confirm?token_hash=abc123&type=magiclink&next=/`, SITE);
        writeFileSync(join(dir!, `${kind}.${locale}.html`), email.html);
        names.push(`${kind}.${locale}`);
      }
    }
    writeFileSync(join(dir!, "index.html"), `<ul>${names.map((name) => `<li><a href="${name}.html">${name}</a></li>`).join("")}</ul>`);
    expect(names.length).toBe((ORDER_EMAIL_KEYS.length + 5) * 2);
  });
});
