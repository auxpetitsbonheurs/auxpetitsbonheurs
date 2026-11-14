// E-13 S-249 and E-15 S-302: Workshops keeps its page text and photos, then lists the upcoming
// published workshop events (photo, date, times, address, price per cake, places left or Full)
// with a link to each event's page; a calm empty state and the WhatsApp call to action
// otherwise. No form on this page (the form is on the event page, S-303).
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createRoutesStub } from "react-router";
import { renderToStaticMarkup } from "react-dom/server";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { messagesFor } from "~/i18n/catalog.server";
import { I18nProvider } from "~/i18n/react";
import type { FooterContacts } from "~/components/shell/site-footer";
import type { EventView } from "~/components/workshops/event-card";
import { localeFromPathname } from "~/lib/locale";
import { clearSitePageCache } from "~/server/services/site-page.server";
import { routeArgs } from "~/server/testing/route-context";
import { insertWorkshopEvent } from "~/server/testing/workshops";
import Workshops, { loader } from "./workshops";

type LoaderData = Parameters<typeof Workshops>[0]["loaderData"];
const NO_CONTACTS: FooterContacts = { whatsapp: null, phone: null, email: null, pickupAddress: null, instagramUrl: null, facebookUrl: null, mapUrl: null };

/** Renders inside a site layout route so the page finds the footer contacts (WhatsApp, phone). */
function render(loaderData: Record<string, unknown>, contacts: FooterContacts = { ...NO_CONTACTS, whatsapp: "+230 5000 0000" }, path = "/workshops") {
  const locale = localeFromPathname(path);
  const data = { title: "", description: "", indexable: true, page: { key: "workshops", isPlaceholder: false, text: { intro: "We hold workshops.", body: "Come along." }, photos: [] }, events: [], ...loaderData } as unknown as LoaderData;
  const Stub = createRoutesStub([{ id: `site-${locale}`, path: "/", loader: () => ({ contacts }), HydrateFallback: () => null, children: [{ path: "*", Component: () => <Workshops {...({ loaderData: data } as unknown as Parameters<typeof Workshops>[0])} /> }] }]);
  return renderToStaticMarkup(
    <I18nProvider locale={locale} messages={messagesFor(locale)}>
      <Stub initialEntries={[path]} hydrationData={{ loaderData: { [`site-${locale}`]: { contacts } } }} />
    </I18nProvider>,
  );
}

const event: EventView = {
  slug: "valentines",
  title: "Valentine's cake workshop",
  description: "Ten couples decorate a cake together.",
  photo: { url: "https://cdn.test/v.webp", width: 1600, height: 1200, srcSet: "https://cdn.test/v-480w.webp 480w, https://cdn.test/v.webp 1600w" },
  eventOn: "2027-02-14",
  dateLabel: "Sunday 14 February 2027",
  timeLabel: "14:00–16:30",
  address: "12 Rue Example, Beau Bassin",
  mapUrl: null,
  priceRs: 1500,
  placesLeft: 3,
};

describe("view", () => {
  test("S-249 AC1: h1, intro, body and photos with alt stay above the list", () => {
    const html = render({ page: { key: "workshops", isPlaceholder: false, text: { intro: "We hold workshops.", body: "Come along." }, photos: [{ url: "https://cdn.test/w.webp", width: 900, height: 600, alt: "Hands icing a cake" }] } });

    expect(html).toMatch(/<h1[^>]*>Workshops<\/h1>/);
    expect(html).toContain("We hold workshops.");
    expect(html).toContain("Come along.");
    expect(html).toContain('alt="Hands icing a cake" width="900" height="600"');
  });

  test("S-302 AC1: each upcoming event shows photo, title, date, times, address, price per cake, places left and its link", () => {
    const html = render({ events: [event] });

    expect(html).toMatch(/<h2[^>]*>Upcoming workshops<\/h2>/);
    expect(html).toContain('href="/workshops/valentines"');
    expect(html).toContain("Valentine&#x27;s cake workshop");
    expect(html).toContain('<time dateTime="2027-02-14">Sunday 14 February 2027</time>');
    expect(html).toContain("14:00–16:30");
    expect(html).toContain("12 Rue Example, Beau Bassin");
    expect(html).toContain("Rs 1,500 per cake · up to 2 people per cake");
    expect(html).toContain("3 places left");
    expect(html).toMatch(/<img[^>]*srcSet="https:\/\/cdn.test\/v-480w.webp 480w[^"]*"[^>]*width="1600" height="1200"/);
  });

  test("S-302 AC1: a full event says Full; one place says 1 place left; French wording", () => {
    expect(render({ events: [{ ...event, placesLeft: 0 }] })).toContain(">Full<");
    expect(render({ events: [{ ...event, placesLeft: 1 }] })).toContain("1 place left");
    const fr = render({ events: [{ ...event, placesLeft: 0 }] }, undefined, "/fr/workshops");
    expect(fr).toContain(">Complet<");
    expect(fr).toContain('href="/fr/workshops/valentines"');
    expect(fr).toContain("par gâteau · jusqu&#x27;à 2 personnes par gâteau");
  });

  test("S-302 AC2: with no upcoming workshop, a calm empty state", () => {
    const html = render({ events: [] });

    expect(html).toContain("No workshop planned right now");
    expect(html).toContain("Follow us or message us to hear about the next one.");
  });

  test("no form on the list page", () => {
    expect(render({ events: [event] })).not.toMatch(/<form|<input|<select/);
  });

  test("S-249 AC3, AC5: WhatsApp with a pre-filled message in the page language, new tab, screen-reader cue", () => {
    const en = render({});
    const fr = render({}, undefined, "/fr/workshops");

    const attr = (text: string) => encodeURIComponent(text).replaceAll("'", "&#x27;");
    expect(en).toContain(`href="https://wa.me/23050000000?text=${attr("Hello, I'd like to know more about your workshops.")}" target="_blank" rel="noopener noreferrer"`);
    expect(en).toMatch(/Ask about workshops on WhatsApp<span class="sr-only"> \(opens WhatsApp\)<\/span>/);
    expect(fr).toContain(`?text=${attr("Bonjour, j'aimerais en savoir plus sur vos ateliers.")}`);
  });

  test("S-249 AC3: without WhatsApp the phone shows; with neither, a Contact us link", () => {
    expect(render({}, { ...NO_CONTACTS, phone: "+230 5000 0001" })).toContain('href="tel:+23050000001"');
    const neither = render({}, NO_CONTACTS);
    expect(neither).not.toContain("wa.me");
    expect(neither).toMatch(/href="\/contact"[^>]*>Contact us</);
  });

  test("S-249 AC4: a failed read shows the error state with Retry", () => {
    const html = render({ page: null });

    expect(html).toContain("We could not load this page.");
    expect(html).toContain("Try again");
  });
});

describe("loader (S-302 AC1, AC3)", () => {
  let database: TestDatabase;
  beforeAll(async () => {
    database = await createTestDatabase();
    await insertWorkshopEvent(database, { slug: "later", titleEn: "Later", eventOn: "2027-03-01" });
    await insertWorkshopEvent(database, { slug: "soon", titleEn: "Soon", titleFr: "Bientôt", eventOn: "2027-02-14" });
    await insertWorkshopEvent(database, { slug: "draft", titleEn: "Draft", status: "draft" });
    await insertWorkshopEvent(database, { slug: "cancelled", titleEn: "Cancelled", status: "cancelled" });
    await insertWorkshopEvent(database, { slug: "past", titleEn: "Past", eventOn: "2027-02-13" });
  }, 60_000);
  afterAll(async () => {
    clearSitePageCache();
    await database.close();
  });

  const load = async (now: string, path = "/workshops") => {
    clearSitePageCache();
    return (await loader(routeArgs(database, { path, now }) as never)) as { events: EventView[]; indexable: boolean };
  };

  test("published events from today on, soonest first; drafts, cancelled and past ones never", async () => {
    const { events } = await load("2027-02-13T21:00:00Z", "/fr/workshops");
    expect(events.map((e) => e.slug)).toEqual(["soon", "later"]);
    expect(events[0]).toMatchObject({ title: "Bientôt", dateLabel: "dimanche 14 février 2027", timeLabel: "14 h 00 – 16 h 30", placesLeft: 10 });
  });

  test("the day after an event it is gone", async () => {
    expect((await load("2027-02-14T21:00:00Z")).events.map((e) => e.slug)).toEqual(["later"]);
  });

  test("with listed workshops the page is indexable even while the intro is sample text", async () => {
    expect((await load("2026-11-12T08:00:00Z")).indexable).toBe(true);
  });
});
