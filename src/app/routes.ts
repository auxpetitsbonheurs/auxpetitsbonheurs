import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

/**
 * Customer pages exist twice: English unprefixed and French under /fr (FR-001),
 * from the same route modules with locale-suffixed ids. An exact `fr` prefix (not
 * an optional `:lang?` segment) keeps /basket from being read as a language and
 * lets unknown paths such as /it/ get the in-shell 404 page.
 */
function customerPages(locale: "en" | "fr") {
  return [
    index("routes/home.tsx", { id: `home-${locale}` }),
    route("menu/:slug", "routes/site/product.tsx", { id: `product-${locale}` }),
    route("basket", "routes/site/basket.tsx", { id: `basket-${locale}` }),
    route("order/:token/confirmed", "routes/site/order-confirmed.tsx", { id: `order-confirmed-${locale}` }),
    route("t/:token", "routes/site/tracking.tsx", { id: `tracking-${locale}` }),
    route("*", "routes/site/not-found.tsx", { id: `not-found-${locale}` }),
  ];
}

export default [
  layout("routes/site/layout.tsx", { id: "site-en" }, customerPages("en")),
  route("fr", "routes/site/layout.tsx", { id: "site-fr" }, customerPages("fr")),
] satisfies RouteConfig;
