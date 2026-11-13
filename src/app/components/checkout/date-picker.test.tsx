// S-087: the checkout date picker, server-rendered with the real catalogue, and its pure model
// (grids, keyboard moves, reasons). Keyboard and screen-reader use in a browser:
// tests/e2e/checkout-dates.spec.ts. Fixed dates only.
import { describe, expect, test } from "vitest";
import { type AvailabilityRules, type DatedItem, basketDates } from "~/domain/availability";
import { createTranslator } from "~/i18n/translator";
import { messagesFor } from "~/i18n/catalog.server";
import { links, renderInSite } from "~/server/testing/render-in-site";
import DatePicker from "./date-picker";
import { monthWeeks, monthsBetween, nextFocus, reasonText } from "./date-picker-model";

const TODAY = "2026-11-09"; // Monday
const RULES: AvailabilityRules = { defaultNoticeDays: 3, closedWeekdays: [7], blocked: [] };
const CAKE: DatedItem<string> = { name: "Chocolate cake", noticeDays: null, season: null };

function render(options: { rules?: AvailabilityRules; items?: DatedItem<string>[]; initial?: string; path?: string; whatsapp?: string | null } = {}) {
  const dates = basketDates(TODAY, options.rules ?? RULES, options.items ?? [CAKE]);
  return renderInSite(<DatePicker dates={dates} today={TODAY} initial={options.initial} whatsapp={options.whatsapp === undefined ? "+230 5712 3456" : options.whatsapp} />, options.path ?? "/basket");
}

/** The `<td>` of a day, by its data-date. */
const cell = (html: string, date: string) => new RegExp(`<td[^>]*data-date="${date}"[^>]*>(.*?)</td>`).exec(html);
const spoken = (html: string, date: string) => /<span class="sr-only">([^<]*)<\/span>/.exec(cell(html, date)?.[1] ?? "")?.[1];

describe("AC1: earliest date from the largest notice", () => {
  test("default notice 3 on Mon 9 Nov: 'Earliest date: Thu 12 Nov', the month of that day shown", () => {
    const html = render();

    expect(html).toContain("Earliest date: Thu 12 Nov");
    expect(html).toContain(">November 2026<");
    expect(html).toMatch(/role="grid" aria-labelledby="date-heading date-month"/);
  });

  test("a 5-day item in the basket moves it to Sat 14 Nov", () => {
    expect(render({ items: [CAKE, { name: "Wedding cake", noticeDays: 5, season: null }] })).toContain("Earliest date: Sat 14 Nov");
  });

  test("the 90 days reach from today to today + 89 across four months", () => {
    expect(monthsBetween(TODAY, "2027-02-06")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
  });
});

describe("AC2: the reason under the calendar, never private, never 'Fully booked'", () => {
  const t = createTranslator("en", messagesFor("en"));
  const dates = basketDates(TODAY, { ...RULES, blocked: [{ startsOn: "2026-11-20", endsOn: "2026-11-20" }] }, [CAKE]);
  const reason = (date: string, reasonCode: Parameters<typeof reasonText>[0]["reason"]) => reasonText({ date, available: false, reason: reasonCode }, dates, TODAY, t, "en");

  test.each([
    ["2026-11-10", "too_soon", "Too soon: we need 3 days' notice"],
    ["2026-11-15", "closed", "Closed on Sundays"],
    ["2026-11-20", "blocked", "Not available"],
    ["2027-02-07", "too_far", "Not available"],
    ["2026-11-08", "too_soon", "This day has passed"],
  ] as const)("%s (%s) reads %j", (date, code, text) => {
    expect(reason(date, code)).toBe(text);
  });

  test("closed weekday names come from the Settings day, in French too", () => {
    const fr = createTranslator("fr", messagesFor("fr"));
    expect(reasonText({ date: "2026-11-16", available: false, reason: "closed" }, dates, TODAY, fr, "fr")).toBe("Fermé le lundi");
  });

  test("one day of notice is singular", () => {
    expect(reasonText({ date: "2026-11-09", available: false, reason: "too_soon" }, { ...dates, noticeDays: 1 }, TODAY, t, "en")).toBe("Too soon: we need 1 day's notice");
  });

  test("the page never says 'Fully booked' and never carries a private block reason", () => {
    const html = render({ rules: { ...RULES, blocked: [{ startsOn: "2026-11-20", endsOn: "2026-11-20", reason: "Family wedding" } as never] } });
    expect(html).not.toMatch(/Fully booked|Family wedding/);
  });
});

describe("AC3: unavailable days are struck through, focusable and named with their reason", () => {
  test("a too-soon day: aria-disabled, line-through, in the roving focus order, spoken with the reason", () => {
    const html = render();
    const td = cell(html, "2026-11-10")![0];

    expect(td).toContain('aria-disabled="true"');
    expect(td).toContain('tabindex="-1"');
    expect(td).toContain("line-through");
    expect(spoken(html, "2026-11-10")).toBe("Tuesday 10 November, not available: Too soon: we need 3 days&#x27; notice");
  });

  test("the earliest day is the one Tab stop of the grid, available and unselected", () => {
    const html = render();
    const td = cell(html, "2026-11-12")![0];

    expect(td).toContain('tabindex="0"');
    expect(td).toContain('id="date"');
    expect(td).toContain('aria-selected="false"');
    expect(td).not.toContain("aria-disabled");
    expect(spoken(html, "2026-11-12")).toBe("Thursday 12 November");
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
  });

  test("a posted date is selected, spoken as selected, and posted in the hidden field", () => {
    const html = render({ initial: "2026-11-24" });

    expect(cell(html, "2026-11-24")![0]).toContain('aria-selected="true"');
    expect(spoken(html, "2026-11-24")).toBe("Tuesday 24 November, selected");
    expect(html).toContain('<input type="hidden" name="date" value="2026-11-24"/>');
    expect(html).toContain("Selected: Tue 24 Nov");
  });

  test("a chosen day that is no longer available stays chosen and says so calmly (AC5: selection survives)", () => {
    const html = render({ initial: "2026-11-24", rules: { ...RULES, blocked: [{ startsOn: "2026-11-24", endsOn: "2026-11-24" }] } });

    expect(html).toContain('value="2026-11-24"');
    expect(html).toContain("Your chosen date Tue 24 Nov is no longer available: Not available. Please choose another day.");
  });

  test("past days of the month show, but are not in the focus order", () => {
    const td = cell(render(), "2026-11-02")![0];
    expect(td).toContain('aria-disabled="true"');
    expect(td).not.toContain("tabindex");
  });
});

describe("AC4: no date in the horizon", () => {
  test("'No dates available, contact us on WhatsApp' with a WhatsApp button and no calendar", () => {
    const html = render({ rules: { ...RULES, closedWeekdays: [1, 2, 3, 4, 5, 6, 7] } });

    expect(html).toContain("No dates available, contact us on WhatsApp");
    expect(html).not.toContain('role="grid"');
    expect(links(html).find((l) => l.text === "Message us on WhatsApp")?.href).toMatch(/^https:\/\/wa\.me\/23057123456\?text=/);
  });

  test("without a WhatsApp number, a link to the contact page", () => {
    const html = render({ rules: { ...RULES, closedWeekdays: [1, 2, 3, 4, 5, 6, 7] }, whatsapp: null });
    expect(links(html).find((l) => l.text === "Contact us")?.href).toBe("/contact");
  });
});

describe("AC6: a seasonal item until 25 Dec", () => {
  const yule: DatedItem<string> = { name: "Yule log", noticeDays: null, season: { startsOn: "2026-11-01", endsOn: "2026-12-25" } };

  test("later dates are unavailable with 'Not available: {item} is only available {start} to {end}'", () => {
    const t = createTranslator("en", messagesFor("en"));
    const dates = basketDates(TODAY, RULES, [CAKE, yule]);
    const day = dates.days.find((d) => d.date === "2026-12-26")!;

    expect(day.reason).toBe("out_of_season");
    expect(reasonText(day, dates, TODAY, t, "en")).toBe("Not available: Yule log is only available 1 Nov to 25 Dec");
    expect(dates.days.find((d) => d.date === "2026-12-24")!.available).toBe(true);
  });

  test("S-084 AC6: the French text exists and names the item", () => {
    const fr = createTranslator("fr", messagesFor("fr"));
    const dates = basketDates(TODAY, RULES, [yule]);
    expect(reasonText({ date: "2026-12-26", available: false, reason: "out_of_season" }, dates, TODAY, fr, "fr")).toBe("Indisponible : Yule log n'est proposé que du 1 nov. au 25 déc.");
  });
});

describe("AC8: keyboard moves and the month grid", () => {
  const first = TODAY;
  const last = "2027-02-06";

  test.each([
    ["ArrowRight", "2026-11-20", "2026-11-21"],
    ["ArrowLeft", "2026-11-20", "2026-11-19"],
    ["ArrowDown", "2026-11-20", "2026-11-27"],
    ["ArrowUp", "2026-11-20", "2026-11-13"],
    ["Home", "2026-11-20", "2026-11-16"],
    ["End", "2026-11-20", "2026-11-22"],
    ["PageDown", "2026-11-20", "2026-12-20"],
    ["PageUp", "2026-12-31", "2026-11-30"],
    ["ArrowUp", "2026-11-12", TODAY],
    ["PageDown", "2027-01-31", last],
  ])("%s from %s goes to %s (kept inside the 90 days)", (key, from, to) => {
    expect(nextFocus(from, key, first, last)).toBe(to);
  });

  test("other keys do nothing", () => {
    expect(nextFocus("2026-11-20", "a", first, last)).toBeNull();
  });

  test("November 2026 starts on a Sunday column and has 5 rows Monday first", () => {
    const weeks = monthWeeks("2026-11");
    expect(weeks[0]).toEqual([null, null, null, null, null, null, "2026-11-01"]);
    expect(weeks).toHaveLength(6);
    expect(weeks.flat().filter(Boolean)).toHaveLength(30);
  });

  test("FR headers and month in French; every day cell is 44 px (size-11)", () => {
    const html = render({ path: "/fr/basket" });
    expect(html).toContain(">novembre 2026<");
    expect(html).toContain('abbr="lundi"');
    expect(html).toContain("Date la plus proche : jeu. 12 nov.");
    expect(cell(html, "2026-11-12")![1]).toContain("size-11");
  });
});
