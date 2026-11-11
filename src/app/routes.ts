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

/**
 * Admin app (no URL language: it follows the admin's own). Login and sign-out sit
 * outside the guarded layout; every other admin module calls `requireAdmin` itself.
 */
const adminPages = [
  route("admin/login", "routes/admin/login.tsx"),
  route("admin/sign-out", "routes/admin/sign-out.tsx"),
  route("admin", "routes/admin/layout.tsx", [
    index("routes/admin/home.tsx"),
    route("orders", "routes/admin/orders.tsx"),
    route("orders/:id", "routes/admin/order.tsx"),
    // Owner-only (S-022); placeholders until E-02/E-03 build the screens.
    route("availability", "routes/admin/availability.tsx"),
    route("settings", "routes/admin/settings.tsx"),
    route("team", "routes/admin/team.tsx"),
    route("*", "routes/admin/not-found.tsx"),
  ]),
];

/** Resource routes (no page, no language). */
const resourceRoutes = [
  route("healthz", "routes/hooks/healthz.ts"),
  route("api/menu", "routes/hooks/menu.ts"),
  route("api/basket/reissue", "routes/hooks/basket-reissue.ts"),
];

export default [
  ...resourceRoutes,
  ...adminPages,
  layout("routes/site/layout.tsx", { id: "site-en" }, customerPages("en")),
  route("fr", "routes/site/layout.tsx", { id: "site-fr" }, customerPages("fr")),
] satisfies RouteConfig;
