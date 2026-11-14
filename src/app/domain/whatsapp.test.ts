// S-201: WhatsApp messages from templates in the order's language, and the one wa.me builder.
import { describe, expect, test } from "vitest";
import { DEFAULT_WHATSAPP_TEMPLATES, WHATSAPP_TEMPLATE_KEYS, type WhatsappValues, fillTemplate, templateText, unknownPlaceholders, waMeUrl, whatsappLinkFor } from "./whatsapp";

const DELIVERY: WhatsappValues = {
  name: "Aisha",
  order_number: "APB-0042",
  date: "Saturday 14 November",
  window: "Morning 9:00-12:00",
  total: "Rs 1,250",
  juice_number: "5712 0000",
  pickup_address: null,
  tracking_link: "https://shop.test/t/abc",
};

describe("resolution (AC1, AC4)", () => {
  test.each(WHATSAPP_TEMPLATE_KEYS.flatMap((key) => (["en", "fr"] as const).map((locale) => [key, locale] as const)))("%s in %s: every placeholder replaced, no braces, no double spaces", (key, locale) => {
    const text = fillTemplate(templateText(null, key, locale), DELIVERY);

    expect(text).not.toMatch(/[{}]/);
    expect(text).not.toMatch(/ {2}/);
    expect(text).toContain("Aisha");
  });

  test("a placeholder without a value (pickup address on a delivery order) is empty and the spaces collapse", () => {
    expect(fillTemplate("Hi {name}, {pickup_address} see you {window}.", DELIVERY)).toBe("Hi Aisha, see you Morning 9:00-12:00.");
    expect(fillTemplate("Ready {pickup_address}!", { pickup_address: "" })).toBe("Ready !");
  });

  test("an unknown placeholder never reaches the customer", () => {
    expect(fillTemplate("Hi {foo}{name}", DELIVERY)).toBe("Hi Aisha");
  });
});

describe("language (AC2)", () => {
  test("an FR order with an empty FR template uses the EN text; a stored FR text wins", () => {
    const stored = { ...DEFAULT_WHATSAPP_TEMPLATES, blank: { en: "Hi {name}", fr: "  " } };
    expect(templateText(stored, "blank", "fr")).toBe("Hi {name}");
    expect(templateText({ ...stored, blank: { en: "Hi", fr: "Salut" } }, "blank", "fr")).toBe("Salut");
    expect(templateText(stored, "approved", "fr")).toBe(DEFAULT_WHATSAPP_TEMPLATES.approved.fr);
  });
});

describe("payment reminder (AC5)", () => {
  test("includes the Juice number and the total as Rs 1,250", () => {
    const text = fillTemplate(templateText(null, "payment_reminder", "en"), DELIVERY);

    expect(text).toContain("5712 0000");
    expect(text).toContain("Rs 1,250");
  });
});

describe("encoding (AC3, AC8)", () => {
  test("wa.me with the digits and the URL-encoded message", () => {
    expect(waMeUrl("23057123456", "Bonjour Zoé & co #1")).toBe("https://wa.me/23057123456?text=Bonjour%20Zo%C3%A9%20%26%20co%20%231");
  });

  test.each(["Aisha & Co", "Aisha #1", "Aisha 🎂", "Aisha\n/evil?x=1", "a/../../b@evil.com"])("a name like %j cannot change the host or the path", (name) => {
    const url = new URL(whatsappLinkFor("+230 5712 3456", fillTemplate("Hi {name}", { name }))!);

    expect(url.host).toBe("wa.me");
    expect(url.pathname).toBe("/23057123456");
    expect(url.searchParams.get("text")).toBe(`Hi ${name}`.split("\n").map((l) => l.trim()).join("\n"));
  });

  test("no usable phone, no link", () => {
    expect(whatsappLinkFor(null)).toBeNull();
    expect(whatsappLinkFor("123")).toBeNull();
  });
});

describe("placeholders allow-list (S-202 AC3)", () => {
  test("names each unknown placeholder once", () => {
    expect(unknownPlaceholders("Hi {name} {foo} {foo} {Name} {total}")).toEqual(["foo", "Name"]);
    expect(unknownPlaceholders(DEFAULT_WHATSAPP_TEMPLATES.approved.en)).toEqual([]);
  });
});
