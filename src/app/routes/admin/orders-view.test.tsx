// The Orders to review view (S-017 AC1): the empty state and the cursor link.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { messagesFor } from "~/i18n/catalog.server";
import { I18nProvider } from "~/i18n/react";
import AdminOrders from "./orders";

type Props = Parameters<typeof AdminOrders>[0];

function render(loaderData: Partial<Props["loaderData"]>, locale: "en" | "fr" = "en") {
  const props = { loaderData: { title: "", data: [], nextCursor: null, limit: 30, ...loaderData } } as unknown as Props;
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
    expect(html).not.toContain("<ul");
  });

  test("in French", () => {
    expect(render({}, "fr")).toContain("Aucune commande à valider.");
  });

  test("a next cursor becomes an Older orders link that keeps the tab", () => {
    expect(render({ nextCursor: "bjoy" })).toContain('href="/admin/orders?tab=review&amp;cursor=bjoy"');
  });
});
