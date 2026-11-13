// S-251 AC1..AC5, AC7, AC8: the Contact us page, server-rendered.
import { describe, expect, test } from "vitest";
import { links, renderInSite } from "~/server/testing/render-in-site";
import Contact, { ErrorBoundary } from "./contact";

type Data = Parameters<typeof Contact>[0]["loaderData"];

const base: Data = {
  title: "Contact us",
  description: "d",
  whatsapp: "+230 5000 0000",
  phone: "+230 400 0000",
  email: null,
  address: null,
  mapUrl: null,
  text: { intro: "Say hello.", hours: "Tue to Sat\n9:00 to 17:00", pickupNote: "Pickup note." },
  isPlaceholder: true,
};

const page = (data: Partial<Data> = {}, path = "/contact") => renderInSite(<Contact {...({ loaderData: { ...base, ...data } } as never)} />, path);

describe("Contact us page (S-251)", () => {
  test("AC1: one h1, intro, WhatsApp, phone as tel: with the number as text, the Beau Bassin area and the hours", () => {
    const html = page();

    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toMatch(/<h1[^>]*>Contact us<\/h1>/);
    expect(html).toContain("Say hello.");
    expect(html).toContain("Pickup in Beau Bassin");
    expect(html).toContain("Opening hours");
    const call = links(html).find((l) => l.href.startsWith("tel:"));
    expect(call).toMatchObject({ href: "tel:+2304000000", text: "Call +230 400 0000" });
  });

  test("AC1: in French the headings and labels are French", () => {
    const html = page({}, "/fr/contact");

    expect(html).toMatch(/<h1[^>]*>Contact<\/h1>/);
    expect(html).toContain("Retrait à Beau Bassin");
    expect(links(html).find((l) => l.href.startsWith("tel:"))?.text).toBe("Appeler le +230 400 0000");
  });

  test("AC2: WhatsApp opens wa.me with a greeting in the visitor's language", () => {
    expect(links(page()).find((l) => l.href.startsWith("https://wa.me/"))).toMatchObject({
      href: "https://wa.me/23050000000?text=Hello%2C%20I%20have%20a%20question.",
      text: "Message us on WhatsApp",
    });
    expect(links(page({}, "/fr/contact")).find((l) => l.href.startsWith("https://wa.me/"))?.href).toBe(
      "https://wa.me/23050000000?text=Bonjour%2C%20j&#x27;ai%20une%20question.", // HTML-escaped apostrophe
    );
  });

  test("AC2: without WhatsApp or phone the buttons are omitted; area and hours still show", () => {
    const html = page({ whatsapp: null, phone: null });

    expect(html).not.toContain("wa.me");
    expect(html).not.toContain("tel:");
    expect(html).not.toContain("Message or call us");
    expect(html).toContain("Pickup in Beau Bassin");
    expect(html).toContain("Tue to Sat");
  });

  test("AC3: a map URL shows 'View on map' opening in a new tab, said to screen readers", () => {
    const map = links(page({ mapUrl: "https://maps.example.test/apb" })).find((l) => l.href === "https://maps.example.test/apb");

    expect(map?.text).toBe("View on map (opens in a new tab)");
    expect(map?.attrs).toContain('target="_blank"');
    expect(map?.attrs).toContain('rel="noopener noreferrer"');
  });

  test("AC3: no map URL, no map link, no iframe and no script", () => {
    const html = page();

    expect(html).not.toContain("View on map");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("<script");
  });

  test("AC4: no form; without a Settings email, no mailto", () => {
    const html = page();

    expect(html).not.toContain("<form");
    expect(html).not.toContain("mailto:");
  });

  test("AC4 (amended): the Settings email shows as a mailto link with the address as text, like the footer", () => {
    const html = page({ email: "hello@example.com" });

    const mail = links(html).find((l) => l.href.startsWith("mailto:"));
    expect(mail?.href).toBe("mailto:hello@example.com");
    expect(mail?.text).toContain("hello@example.com");
    expect(page({ email: "hello@example.com" }, "/fr/contact")).toContain("Écrire à");
  });

  test("AC5, AC6: the exact address and the hours are escaped plain text with line breaks kept", () => {
    const html = page({ address: "12 Royal Road\nBeau Bassin", text: { ...base.text, hours: "<b>Mon</b>\n9:00" } });

    expect(html).toContain("12 Royal Road\nBeau Bassin");
    expect(html).toContain("&lt;b&gt;Mon&lt;/b&gt;\n9:00");
    expect(html).not.toContain("<b>");
  });

  test("AC7: the error state keeps the h1 and offers Retry", () => {
    const html = renderInSite(<ErrorBoundary {...({} as never)} />, "/contact");

    expect(html).toMatch(/<h1[^>]*>Contact us<\/h1>/);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Try again");
  });
});
