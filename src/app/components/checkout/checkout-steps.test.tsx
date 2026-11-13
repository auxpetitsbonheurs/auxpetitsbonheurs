// S-088 AC1, AC5, AC6 (structure): the time windows section, server-rendered with the real
// catalogue. S-087 AC9: the date section before hydration is the native field (no-JS fallback).
import { describe, expect, test } from "vitest";
import { basketDates } from "~/domain/availability";
import { renderInSite } from "~/server/testing/render-in-site";
import { DateSection, TimeSection } from "./checkout-steps";

const windows = {
  delivery: [
    { id: "morning", start: "09:00", end: "12:00", label: { en: "Morning", fr: "Matin" } },
    { id: "afternoon", start: "12:00", end: "17:30", label: { en: "Afternoon" } },
  ],
  pickup: [{ id: "noon", start: "11:00", end: "14:00", label: { en: "Noon", fr: "Midi" } }],
};

const radios = (html: string, name: string) => [...html.matchAll(new RegExp(`name="${name.replace(".", "\\.")}" value="([^"]+)"`, "g"))].map((m) => m[1]);

describe("time windows (S-088)", () => {
  test("AC1: one labelled radio group per fulfilment, from the Settings lists, shown once a fulfilment is chosen", () => {
    const html = renderInSite(<TimeSection windows={windows} initial={{}} />, "/basket");

    expect(radios(html, "windowId.delivery")).toEqual(["morning", "afternoon"]);
    expect(radios(html, "windowId.pickup")).toEqual(["noon"]);
    expect(html).toMatch(/<fieldset data-when="delivery"[^>]*><legend[^>]*>Delivery time<\/legend>/);
    expect(html).toMatch(/<fieldset data-when="pickup"[^>]*><legend[^>]*>Pickup time<\/legend>/);
    expect(html).toContain('data-when="none">Choose delivery or pickup above to see the times.');
    expect(html).toContain("Morning · 09:00–12:00");
  });

  test("AC5: French labels and French times; a window without French falls back to English", () => {
    const html = renderInSite(<TimeSection windows={windows} initial={{}} />, "/fr/basket");

    expect(html).toContain("Matin · 9 h–12 h");
    expect(html).toContain("Afternoon · 12 h–17 h 30");
    expect(html).toContain("Heure de livraison");
  });

  test("AC3, AC4: the error is tied to the section the summary links to, and the posted choice stays checked", () => {
    const html = renderInSite(<TimeSection windows={windows} initial={{ "windowId.pickup": "noon" }} error="Choose a time." />, "/basket");

    expect(html).toMatch(/id="windows" tabindex="-1" aria-describedby="windows-error"/);
    expect(html).toMatch(/<input[^>]*id="window-pickup-noon"[^>]*checked=""/);
  });

  test("AC6: each row is a 48 px radio card", () => {
    expect(renderInSite(<TimeSection windows={windows} initial={{}} />, "/basket")).toContain("min-h-12");
  });
});

describe("date before hydration (S-087 AC9)", () => {
  test("a native date field from the earliest date to the horizon, with the earliest date as its hint", () => {
    const dates = basketDates<string>("2026-11-09", { defaultNoticeDays: 3, closedWeekdays: [7], blocked: [] }, []);
    const html = renderInSite(<DateSection dates={dates} today="2026-11-09" whatsapp={null} />, "/basket");

    expect(html).toMatch(/<input[^>]*type="date"[^>]*min="2026-11-12"[^>]*max="2027-02-06"/);
    expect(html).toContain("Earliest date: Thu 12 Nov");
    expect(html).not.toContain('role="grid"');
  });
});
