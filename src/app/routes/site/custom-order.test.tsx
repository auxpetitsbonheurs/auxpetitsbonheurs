// S-252 AC1, AC2, AC3, AC5, AC6: the Custom order page (interim), server-rendered.
import { describe, expect, test } from "vitest";
import { links, renderInSite } from "~/server/testing/render-in-site";
import CustomOrder, { ErrorBoundary } from "./custom-order";

type Data = Parameters<typeof CustomOrder>[0]["loaderData"];

const base: Data = {
  title: "Custom order",
  description: "d",
  whatsapp: "+230 5000 0000",
  phone: "+230 400 0000",
  noticeDays: 3,
  text: { intro: "A cake for you.", body: "What it is.\n\nHow we do it." },
  photos: [],
  isPlaceholder: true,
};

const page = (data: Partial<Data> = {}, path = "/custom-cake") =>
  renderInSite(<CustomOrder {...({ loaderData: { ...base, ...data } } as never)} />, path);

describe("Custom order page (S-252)", () => {
  test("AC1: one h1, the intro, the body as paragraphs and how it works", () => {
    const html = page();

    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toMatch(/<h1[^>]*>Custom order<\/h1>/);
    expect(html).toContain("A cake for you.");
    expect(html).toMatch(/<p[^>]*>What it is\.<\/p><p[^>]*>How we do it\.<\/p>/);
    expect(html).toContain("How it works");
  });

  test("AC1: French title and headings on /fr", () => {
    const html = page({}, "/fr/custom-cake");

    expect(html).toMatch(/<h1[^>]*>Gâteau sur mesure<\/h1>/);
    expect(html).toContain("Comment ça marche");
  });

  test("AC2: 'Contact us on WhatsApp' opens wa.me with the custom-cake greeting in the visitor's language", () => {
    const wa = links(page()).filter((l) => l.href.startsWith("https://wa.me/"));
    expect(wa[0]).toMatchObject({ href: "https://wa.me/23050000000?text=Hello%2C%20I&#x27;d%20like%20a%20custom%20cake.", text: "Contact us on WhatsApp" });

    const fr = links(page({}, "/fr/custom-cake")).find((l) => l.href.startsWith("https://wa.me/"));
    expect(fr).toMatchObject({ text: "Nous contacter sur WhatsApp" });
    expect(fr?.href).toContain("Bonjour%2C%20je%20voudrais%20un%20g%C3%A2teau%20sur%20mesure.");
  });

  test("AC2: without WhatsApp the phone shows instead; without either, a link to Contact us", () => {
    const phoneOnly = links(page({ whatsapp: null }));
    expect(phoneOnly.some((l) => l.href.startsWith("https://wa.me/"))).toBe(false);
    expect(phoneOnly.find((l) => l.href.startsWith("tel:"))).toMatchObject({ href: "tel:+2304000000", text: "Call +230 400 0000" });

    const none = links(page({ whatsapp: null, phone: null }, "/fr/custom-cake"));
    expect(none.find((l) => l.href === "/fr/contact")?.text).toBe("Voir tous les moyens de nous contacter");
  });

  test("AC3: no form while the request form (E-08 S-151) is not live", () => {
    expect(page()).not.toContain("<form");
  });

  test("AC5: the notice comes from Settings, with no price in the text", () => {
    expect(page()).toContain("at least 3 days before your date");
    expect(page({ noticeDays: 1 })).toContain("at least 1 day before your date");
    expect(page({ noticeDays: 0 })).toContain("as early as you can");
    expect(page({}, "/fr/custom-cake")).toContain("au moins 3 jours avant votre date");
    expect(page()).not.toMatch(/Rs\s?\d/);
  });

  test("AC6: the error state keeps the h1 and offers Retry", () => {
    const html = renderInSite(<ErrorBoundary {...({} as never)} />, "/custom-cake");

    expect(html).toMatch(/<h1[^>]*>Custom order<\/h1>/);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Try again");
  });

  test("AC1 (photos, S-245/S-247): up to 3 photos from admin Pages with size and alt; none leaves no image area", () => {
    const photos = [1, 2].map((n) => ({ url: `https://cdn.test/c${n}.webp`, width: 1200, height: 900, alt: `Cake ${n}` }));

    expect(page({ photos })).toContain('<img src="https://cdn.test/c1.webp" alt="Cake 1" width="1200" height="900" loading="lazy"');
    expect(page()).not.toContain("<img");
  });
});
