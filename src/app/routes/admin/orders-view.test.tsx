// The Orders view (S-017 AC1, S-111 AC2, AC3, AC5, S-112 AC3, AC5; Payment tab S-277, S-279).
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";
import { messagesFor } from "~/i18n/catalog.server";
import { I18nProvider } from "~/i18n/react";
import AdminOrders from "./orders";

type Props = Parameters<typeof AdminOrders>[0];
type LoaderData = Props["loaderData"];

const COUNTS = { review: 0, payment: 0, upcoming: 0, completed: 0, closed: 0 };
const NONE = { q: null, fulfilment: null, paid: null, from: null, to: null };

const ROW = {
  id: "7d1f0c9e-1111-4222-8333-944455566677",
  number: "APB-0042",
  status: "quote_sent",
  source: "custom_request",
  fulfilment: "delivery",
  fulfilOn: "2026-12-11",
  window: { id: "am", start: "09:00", end: "12:00", label: { en: "Morning", fr: "Matin" } },
  contactName: "Marie",
  totalRs: 2500,
  paid: false,
  version: 3,
  dateLabel: "Fri 11 Dec",
  itemsPreview: ["1 × Birthday cake"],
};

function render(loaderData: Partial<LoaderData>, locale: "en" | "fr" = "en") {
  const data = { title: "", tab: "review", counts: COUNTS, filters: NONE, problems: {}, typed: "", data: [], nextCursor: null, limit: 30, payment: null, paymentMissing: false, canEditSettings: false, ...loaderData } as unknown as LoaderData;
  // useFetcher needs a data router.
  const router = createMemoryRouter([{ path: "/admin/orders", element: <AdminOrders {...({ loaderData: data } as Props)} /> }], { initialEntries: ["/admin/orders"] });
  return renderToStaticMarkup(
    <I18nProvider locale={locale} messages={messagesFor(locale)}>
      <RouterProvider router={router} />
    </I18nProvider>,
  );
}

describe("Orders view", () => {
  test("no orders to review shows the calm empty text and no list (S-111 AC5)", () => {
    const html = render({});

    expect(html).toContain("No orders to review. Enjoy the quiet.");
    expect(html).not.toContain("/admin/orders/");
  });

  test.each([
    ["upcoming", "No upcoming orders."],
    ["completed", "No completed orders yet."],
    ["closed", "No closed orders."],
  ])("an empty %s tab says so", (tab, text) => {
    expect(render({ tab: tab as LoaderData["tab"] })).toContain(text);
  });

  test("the tabs say which list is shown, with counts and a dot on To review (S-111 AC2, S-279)", () => {
    const html = render({ counts: { review: 3, payment: 0, upcoming: 7, completed: 1, closed: 0 } });

    expect(html).toMatch(/aria-current="page"[^>]*>To review</);
    expect(html).toContain('href="/admin/orders?tab=payment"');
    expect(html).toContain('href="/admin/orders?tab=upcoming"');
    expect(html).toContain("(3 orders, needs attention)");
    expect(html).toContain('data-testid="tab-dot-review"');
    expect(html).not.toContain('data-testid="tab-dot-payment"');
    expect(html).toContain("(7 orders)");
  });

  test("a row is one link named in full; quote_sent reads Waiting for customer (S-111 AC3, AC8)", () => {
    const html = render({ tab: "upcoming", data: [ROW] as never });

    expect(html).toContain('aria-label="APB-0042, Marie, Fri 11 Dec, Waiting for customer, unpaid"');
    expect(html).toContain(`href="/admin/orders/${ROW.id}"`);
    expect(html).toContain("Waiting for customer");
  });

  test("missing payment details: a warning with the Settings link for an Owner, words for an Admin (S-277 AC5)", () => {
    expect(render({ paymentMissing: true, canEditSettings: true })).toContain('href="/admin/settings#payment-title"');
    const admin = render({ paymentMissing: true, canEditSettings: false });
    expect(admin).toContain("Ask an Owner to add them");
    expect(admin).not.toContain("/admin/settings");
  });

  test("the Payment tab: its worklists, no search", () => {
    const payment = { awaiting: [], refunds: [], cancelled: [] };
    const html = render({ tab: "payment", payment });
    expect(html).toContain("No orders waiting for payment.");
    expect(html).not.toContain('role="search"');
  });

  test("in French", () => {
    expect(render({}, "fr")).toContain("Aucune commande à valider. Profitez du calme.");
  });

  test("a next cursor becomes Load more that keeps the tab and filters (S-111 AC4)", () => {
    const html = render({ tab: "upcoming", data: [ROW] as never, nextCursor: "bjoy", filters: { ...NONE, fulfilment: "delivery" } });
    expect(html).toContain('href="/admin/orders?tab=upcoming&amp;fulfilment=delivery&amp;cursor=bjoy"');
    expect(html).toContain("Load more");
  });

  test("active filters show as removable chips with Clear filters; no match offers Clear filters (S-112 AC3, AC5)", () => {
    const html = render({ tab: "upcoming", filters: { ...NONE, fulfilment: "delivery", paid: false } });

    expect(html).toContain('aria-label="Remove filter: Delivery"');
    expect(html).toContain('href="/admin/orders?tab=upcoming&amp;paid=false"');
    expect(html).toContain('aria-label="Remove filter: Unpaid"');
    expect(html).toContain("No orders match.");
    expect(html).toContain("Clear filters");
    expect(html).not.toContain("Search all orders");
  });

  test("the search box is labelled and keeps what was typed; a too-long search says why (S-112 AC6, AC8)", () => {
    const html = render({ tab: "upcoming", typed: "x".repeat(81), problems: { q: "tooLong" } });

    expect(html).toContain('<label for="orders-q"');
    expect(html).toContain(`value="${"x".repeat(81)}"`);
    expect(html).toContain("Search is limited to 80 characters.");
  });

  test("a date range with the end before the start says the dates were not applied (S-112 AC4)", () => {
    expect(render({ tab: "upcoming", problems: { to: "toBeforeFrom" } })).toContain("The end date is before the start date, so the dates were not applied.");
  });
});
