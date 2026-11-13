// S-188..S-193: every customer email in English and French, as rendered HTML and text:
// phone-readable layout (single column <= 600 px, 16 px text, 44 px buttons, contrast from
// the tokens), escaping, absolute links, no tracking, language, no admin data.
import { describe, expect, test } from "vitest";
import { contrastRatio } from "~/lib/contrast";
import { EMAIL_COLORS, renderEmail } from "./layout";
import { ORDER_EMAIL_KEYS, type OrderEmailData, type OrderEmailKey, renderOrderEmail } from "./order-emails";
import { authEmail } from "./auth-emails";

const SITE = "https://shop.test";

function data(locale: "en" | "fr", overrides: Partial<OrderEmailData["order"]> = {}, payload: OrderEmailData["payload"] = {}): OrderEmailData {
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
      declineReason: null,
      trackingToken: "T".repeat(43),
      createdAt: new Date("2026-11-13T05:00:00Z"),
      ...overrides,
    },
    items: [
      {
        nameEn: "Chocolate cake",
        nameFr: "Gâteau au chocolat",
        quantity: 2,
        lineTotalRs: 1100,
        options: [{ groupId: "g", group: { en: "Size", fr: "Taille" }, kind: "single", choice: { en: "Large", fr: "Grand" }, priceDeltaRs: 0 }],
        cakeMessage: "Happy <b>birthday</b>",
      },
    ],
    request: { occasion: "Wedding", servings: 40, theme: "Roses", photoCount: 2, quoteAmountRs: 4800, quoteNote: "Includes the topper", quoteExpiresOn: "2026-11-20" },
    shop: { pickupAddress: "5 Bakery Lane, Curepipe", pickupMapUrl: "https://maps.test/x", juiceName: "Sarah B", juiceNumber: "5712 3456", paymentWhatsapp: "+23057123456", instagramUrl: "https://instagram.test/bakery" },
    payload,
  };
}

const cases = ORDER_EMAIL_KEYS.flatMap((key) => (["en", "fr"] as const).map((locale) => [key, locale] as const));

describe.each(cases)("%s in %s", (key: OrderEmailKey, locale) => {
  const email = renderOrderEmail(key, data(locale, key === "order_declined" ? { declineReason: "We are fully booked" } : {}, key === "quote_closed" ? { why: "expired" } : {}));

  test("is a single column of at most 600 px, in the order's language, with the bakery name and a plain-text alternative (S-188 AC1, AC3)", () => {
    expect(email.html).toContain(`<html lang="${locale}">`);
    expect(email.html).toContain("max-width:600px");
    expect(email.html).toContain("Aux petits bonheurs");
    expect(email.html).toMatch(/<h1[^>]*>[^<]+<\/h1>/);
    expect(email.text).toContain("Aux petits bonheurs");
    expect(email.text.length).toBeGreaterThan(80);
    expect(email.subject).toContain("APB-0042");
  });

  test("has no body text under 14 px except small labels, every button 44 px high, no horizontal scroll hazards (AC1, AC6)", () => {
    for (const size of email.html.matchAll(/font-size:(\d+)px/g)) expect(Number(size[1])).toBeGreaterThanOrEqual(14);
    for (const button of email.html.matchAll(/<a [^>]*background:[^>]*>/g)) {
      expect(button[0]).toContain("min-height:44px");
      expect(button[0]).toContain("display:block");
    }
    expect(email.html).not.toMatch(/<table|width:\s*[7-9]\d\dpx|white-space:\s*nowrap/);
  });

  test("links are absolute, to the site; no tracking pixel, no script (AC5)", () => {
    expect(email.html).not.toMatch(/<script|<iframe|utm_|width="1" height="1"/i);
    for (const href of email.html.matchAll(/href="([^"]+)"/g)) expect(href[1]).toMatch(/^https:\/\//);
  });

  test("user text is escaped and carries no admin note (AC5, AC8)", () => {
    expect(email.html).not.toContain("<b>birthday</b>");
    expect(email.html).not.toMatch(/admin note|adminNote/i);
  });
});

describe("content per email", () => {
  test("order_received says it is not confirmed yet, lists items with options, the date in Mauritius form, the Juice payment steps and the tracking link", () => {
    const en = renderOrderEmail("order_received", data("en"));

    expect(en.text).toContain("not confirmed yet");
    expect(en.text).toContain("2 × Chocolate cake");
    expect(en.text).toContain("Size: Large");
    expect(en.text).toContain("Saturday, 14 November 2026");
    expect(en.text).toContain("Rs 1,250");
    expect(en.text).toContain("5712 3456");
    expect(en.text).toContain(`${SITE}/t/${"T".repeat(43)}`);
  });

  test("the French order is French all the way: subject, item name, option, window and link prefix", () => {
    const fr = renderOrderEmail("order_received", data("fr"));

    expect(fr.subject).toBe("Nous avons reçu votre commande APB-0042");
    expect(fr.text).toContain("2 × Gâteau au chocolat");
    expect(fr.text).toContain("Taille: Grand");
    expect(fr.text).toContain("Matin 9 h-12 h");
    expect(fr.text).toContain("samedi 14 novembre 2026");
    expect(fr.text).toContain(`${SITE}/fr/t/`);
    expect(fr.text).toContain("Rs 1,250");
  });

  test("the date is the Mauritius calendar date even when its UTC day differs (AC4)", () => {
    expect(renderOrderEmail("ready_for_pickup", data("en", { fulfilOn: "2026-11-14", fulfilment: "pickup" })).text).toContain("Saturday, 14 November");
  });

  test("order_confirmed: cash wording until paid, then 'Payment received'; carries the 48-hour policy", () => {
    expect(renderOrderEmail("order_confirmed", data("en", { status: "approved" })).text).toContain("You pay when you receive");
    const paid = renderOrderEmail("order_confirmed", data("en", { status: "approved", paid: true }));
    expect(paid.text).toContain("Payment received");
    expect(paid.text).toContain("48 hours");
  });

  test("quote: amount, note, expiry and Accept and Decline buttons both to the tracking page", () => {
    const quote = renderOrderEmail("quote", data("en"));

    expect(quote.subject).toBe("Your quote APB-0042: Rs 4,800");
    expect(quote.text).toContain("Includes the topper");
    expect(quote.text).toContain("Friday, 20 November 2026");
    expect(quote.html).toContain("Accept the quote");
    expect(quote.html).toContain("Decline the quote");
    expect(quote.html.match(new RegExp(`href="${SITE}/t/`, "g"))).toHaveLength(2);
  });

  test("order_updated highlights only what changed", () => {
    const updated = renderOrderEmail("order_updated", data("en"), ) ;
    expect(updated.text).not.toContain("New date");

    const changed = renderOrderEmail("order_updated", data("en", {}, { previousDate: "2026-11-12", previousTotalRs: 1000 }));
    expect(changed.text).toContain("New date: Saturday, 14 November 2026 (before: Thursday, 12 November 2026)");
    expect(changed.text).toContain("New total: Rs 1,250 (before: Rs 1,000)");
  });

  test("a decline shows the given reason only, and a refund promise when it was paid", () => {
    const declined = renderOrderEmail("order_declined", data("en", { declineReason: "We are fully booked", paid: true, refundDueRs: 1250 }));

    expect(declined.text).toContain("Reason: We are fully booked");
    expect(declined.text).toContain("we will refund Rs 1,250");
  });

  test("quote_closed says which way it closed", () => {
    expect(renderOrderEmail("quote_closed", data("en", {}, { why: "declined" })).text).toContain("You declined");
    expect(renderOrderEmail("quote_closed", data("en", {}, { why: "expired" })).text).toContain("not accepted in time");
  });

  test("thank_you links to order again and to Instagram", () => {
    const thanks = renderOrderEmail("thank_you", data("en"));

    expect(thanks.html).toContain("Order again");
    expect(thanks.html).toContain("https://instagram.test/bakery");
  });

  test("a missing French name falls back to English", () => {
    const base = data("fr");
    const fr = renderOrderEmail("order_received", { ...base, items: [{ ...base.items[0]!, nameFr: null }] });

    expect(fr.text).toContain("2 × Chocolate cake");
  });
});

describe("layout (S-188 AC2, AC5)", () => {
  test("every text and background pair meets 4.5:1", () => {
    const { text, muted, link, button, onButton, page, card, band } = EMAIL_COLORS;
    for (const [fg, bg] of [[text, page], [text, card], [text, band], [muted, page], [muted, card], [muted, band], [link, card], [button, page], [onButton, button]] as const) {
      expect(contrastRatio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("a long French button label wraps instead of overflowing (AC6)", () => {
    const long = "Demander un gâteau sur mesure pour une grande occasion spéciale";
    const email = renderEmail({ locale: "fr", siteUrl: SITE, subject: "s", heading: "h", blocks: [{ kind: "button", label: long, href: `${SITE}/x` }] });

    expect(email.html).toContain("box-sizing:border-box");
    expect(email.html).not.toContain("white-space");
  });

  test("a heading and a paragraph with markup are escaped", () => {
    const email = renderEmail({ locale: "en", siteUrl: SITE, subject: "s", heading: "<script>x</script>", blocks: [{ kind: "p", text: "a & <i>b</i>" }] });

    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("a &amp; &lt;i&gt;b&lt;/i&gt;");
  });
});

describe("account emails (S-194 AC4, AC5, AC7)", () => {
  test.each(["signup_confirm", "sign_in_link", "password_reset", "email_change", "invite"] as const)("%s: French, one link, 44 px button, no order data", (kind) => {
    const link = `${SITE}/auth/confirm?token_hash=abc&type=x&next=/`;
    const email = authEmail(kind, "fr", link, SITE);

    expect(email.html).toContain('lang="fr"');
    expect(email.html).toContain("min-height:44px");
    expect(email.text.match(/https?:\/\/\S+/g)).toEqual([link]);
    expect(email.text).toMatch(/1 heure/);
    expect(email.text).not.toMatch(/commande|order/i);
  });
});
