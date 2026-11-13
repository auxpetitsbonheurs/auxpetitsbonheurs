// S-066 AC5 (no JavaScript): the ordering area is a lazy chunk in the browser, but the server
// must put the form itself in the HTML on the FIRST render after its loader ran. A suspended
// lazy would stream a fallback and hide the form until a script swaps it in, which never
// happens without JavaScript. Own file: the route module's lazy state must start fresh.
import type { ReactElement } from "react";
import { expect, test } from "vitest";
import { renderInSite } from "~/server/testing/render-in-site";

test("after the loader's preload, the first server render already holds the Add form", async () => {
  const route = await import("./product");
  await route.preloadOrderForm();
  const loaderData = {
    product: {
      id: "11111111-1111-4111-8111-111111111111",
      slug: "lemon-tart",
      type: "dessert",
      name: { en: "Lemon tart", fr: null },
      description: null,
      allergens: [],
      photos: [],
      status: "available",
      minQuantity: null,
      basePriceRs: 900,
      optionGroups: [],
    },
    cakeMessageMax: 40,
    earliestDate: null,
    seasonEndsOn: null,
  };

  const Product = route.default as (props: { loaderData: unknown; actionData: unknown }) => ReactElement;
  const html = renderInSite(<Product loaderData={loaderData} actionData={undefined} />, "/menu/lemon-tart");

  expect(html).toContain('name="intent" value="addToBasket"');
  expect(html).toMatch(/<button[^>]*type="submit"[^>]*>.*Add to basket/s);
});
