// E-13 S-249: Workshops: page text and photos, the optional next workshop (shown until its
// date has passed), a calm empty state, the WhatsApp call to action with a pre-filled
// message (phone, then Contact us as fallbacks), and no booking, price or date picker.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createRoutesStub } from "react-router";
import { renderToStaticMarkup } from "react-dom/server";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { messagesFor } from "~/i18n/catalog.server";
import { I18nProvider } from "~/i18n/react";
import type { FooterContacts } from "~/components/shell/site-footer";
import { localeFromPathname } from "~/lib/locale";
import { clearSitePageCache } from "~/server/services/site-page.server";
import { routeArgs } from "~/server/testing/route-context";
import Workshops, { loader } from "./workshops";

type LoaderData = Parameters<typeof Workshops>[0]["loaderData"];
const NO_CONTACTS: FooterContacts = { whatsapp: null, phone: null, email: null, pickupAddress: null };

/** Renders inside a site layout route so the page finds the footer contacts (WhatsApp, phone). */
function render(loaderData: Partial<LoaderData>, contacts: FooterContacts = { ...NO_CONTACTS, whatsapp: "+230 5000 0000" }, path = "/workshops") {
  const locale = localeFromPathname(path);
  const data = { title: "", description: "", indexable: true, page: { key: "workshops", isPlaceholder: false, text: { intro: "We hold workshops.", body: "Come along." }, photos: [] }, next: null, ...loaderData } as LoaderData;
  const Stub = createRoutesStub([{ id: `site-${locale}`, path: "/", loader: () => ({ contacts }), HydrateFallback: () => null, children: [{ path: "*", Component: () => <Workshops {...({ loaderData: data } as unknown as Parameters<typeof Workshops>[0])} /> }] }]);
  return renderToStaticMarkup(
    <I18nProvider locale={locale} messages={messagesFor(locale)}>
      <Stub initialEntries={[path]} hydrationData={{ loaderData: { [`site-${locale}`]: { contacts } } }} />
    </I18nProvider>,
  );
}

const next = { title: "Valentine's cake workshop", date: "2027-02-14", dateLabel: "Sunday 14 February 2027", seats: 10, text: "Ten couples decorate a cake together.", photo: { url: "https://cdn.test/v.webp", width: 1200, height: 800, alt: "Cakes ready to decorate" } };

describe("view", () => {
  test("AC1: h1, intro, body and photos with alt", () => {
    const html = render({ page: { key: "workshops", isPlaceholder: false, text: { intro: "We hold workshops.", body: "Come along." }, photos: [{ url: "https://cdn.test/w.webp", width: 900, height: 600, alt: "Hands icing a cake" }] } as never });

    expect(html).toMatch(/<h1[^>]*>Workshops<\/h1>/);
    expect(html).toContain("We hold workshops.");
    expect(html).toContain("Come along.");
    expect(html).toContain('alt="Hands icing a cake" width="900" height="600"');
  });

  test("Owner clarification: the next workshop shows title, date, seats, text and photo", () => {
    const html = render({ next });

    expect(html).toMatch(/<h2[^>]*>Valentine&#x27;s cake workshop<\/h2>/);
    expect(html).toContain('<time dateTime="2027-02-14">Sunday 14 February 2027</time>');
    expect(html).toContain("10 seats");
    expect(html).toContain("Ten couples decorate a cake together.");
    expect(html).toContain('alt="Cakes ready to decorate"');
  });

  test("Owner clarification: with no workshop planned, a calm empty state", () => {
    const html = render({ next: null });

    expect(html).toContain("No workshop planned right now");
    expect(html).toContain("Follow us or message us to hear about the next one.");
  });

  test("AC2: no form, no price, no date picker", () => {
    const html = render({ next });

    expect(html).not.toMatch(/<form|<input|<select|Rs\s?\d/);
  });

  test("AC3, AC5: WhatsApp with a pre-filled message in the page language, new tab, named for workshops, screen-reader cue", () => {
    const en = render({});
    const fr = render({}, undefined, "/fr/workshops");

    const attr = (text: string) => encodeURIComponent(text).replaceAll("'", "&#x27;");
    expect(en).toContain(`href="https://wa.me/23050000000?text=${attr("Hello, I'd like to know more about your workshops.")}" target="_blank" rel="noopener noreferrer"`);
    expect(en).toMatch(/Ask about workshops on WhatsApp<span class="sr-only"> \(opens WhatsApp\)<\/span>/);
    expect(fr).toContain(`?text=${attr("Bonjour, j'aimerais en savoir plus sur vos ateliers.")}`);
    expect(fr).toContain("Poser une question sur les ateliers sur WhatsApp");
  });

  test("AC3: without WhatsApp the phone shows; with neither, a Contact us link", () => {
    expect(render({}, { ...NO_CONTACTS, phone: "+230 5000 0001" })).toContain('href="tel:+23050000001"');
    const neither = render({}, NO_CONTACTS);
    expect(neither).not.toContain("wa.me");
    expect(neither).toMatch(/href="\/contact"[^>]*>Contact us</);
  });

  test("AC4: a failed read shows the error state with Retry", () => {
    const html = render({ page: null });

    expect(html).toContain("We could not load this page.");
    expect(html).toContain("Try again");
  });
});

describe("loader: the next workshop shows until its date has passed (Mauritius date)", () => {
  let database: TestDatabase;
  beforeAll(async () => {
    database = await createTestDatabase();
    await database.client.query("update site_page set event = $1 where key = 'workshops'", [JSON.stringify({ title: { en: "Valentine's", fr: "Saint-Valentin" }, date: "2027-02-14", seats: 10, text: null })]);
  }, 60_000);
  afterAll(async () => {
    clearSitePageCache();
    await database.close();
  });

  const load = async (now: string, path = "/workshops") => {
    clearSitePageCache();
    return (await loader(routeArgs(database, { path, now }) as never)) as { next: { title: string; dateLabel: string } | null; indexable: boolean };
  };

  test("on the day itself (Mauritius) it shows, with a long localised date", async () => {
    expect((await load("2027-02-13T21:00:00Z", "/fr/workshops")).next).toMatchObject({ title: "Saint-Valentin", dateLabel: "dimanche 14 février 2027" });
  });

  test("the next day it is gone and the page says none is planned", async () => {
    expect((await load("2027-02-14T21:00:00Z")).next).toBeNull();
  });

  test("AC4: the seeded page is sample text, so noindex", async () => {
    expect((await load("2026-11-12T08:00:00Z")).indexable).toBe(false);
  });
});
