// The Orders to review view (S-017 AC1): the empty state and the cursor link.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { messagesFor } from "~/i18n/catalog.server";
import { I18nProvider } from "~/i18n/react";
import AdminOrders from "./orders";

type Props = Parameters<typeof AdminOrders>[0];

function render(loaderData: Partial<Props["loaderData"]>, locale: "en" | "fr" = "en") {
  const props = { loaderData: { title: "", tab: "review", data: [], nextCursor: null, limit: 30, payment: null, paymentMissing: false, canEditSettings: false, ...loaderData } } as unknown as Props;
  return renderToStaticMarkup(
    <I18nProvider locale={locale} messages={messagesFor(locale)}>
      <AdminOrders {...props} />
    </I18nProvider>,
  );
}

describe("Orders to review view", () => {
  test("no orders shows \"No orders to review.\" and no list", () => {
    const html = render({});

    expect(html).toContain("No orders to review.");
    expect(html).not.toContain("/admin/orders/");
  });

  test("the tabs say which list is shown (S-279)", () => {
    const html = render({});

    expect(html).toContain('aria-current="page"');
    expect(html).toMatch(/aria-current="page"[^>]*>To review</);
    expect(html).toContain('href="/admin/orders?tab=payment"');
  });

  test("missing payment details: a warning with the Settings link for an Owner, words for an Admin (S-277 AC5)", () => {
    expect(render({ paymentMissing: true, canEditSettings: true })).toContain('href="/admin/settings#payment-title"');
    const admin = render({ paymentMissing: true, canEditSettings: false });
    expect(admin).toContain("Ask an Owner to add them");
    expect(admin).not.toContain("/admin/settings");
  });

  test("the Payment tab: time-left badges and the empty state", () => {
    const payment = { awaiting: [], refunds: [], cancelled: [] };
    expect(render({ tab: "payment", payment })).toContain("No orders waiting for payment.");
  });

  test("in French", () => {
    expect(render({}, "fr")).toContain("Aucune commande à valider.");
  });

  test("a next cursor becomes an Older orders link that keeps the tab", () => {
    expect(render({ nextCursor: "bjoy" })).toContain('href="/admin/orders?tab=review&amp;cursor=bjoy"');
  });
});
