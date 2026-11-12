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
  // Password recovery (S-025, S-026): public like login; reset needs a recovery session.
  route("admin/forgot", "routes/admin/forgot.tsx"),
  route("admin/reset", "routes/admin/reset.tsx"),
  // Installable admin app (S-035): public manifest and service worker (scope /admin/).
  route("admin/manifest.webmanifest", "routes/admin/manifest.tsx"),
  route("admin/sw.js", "routes/admin/sw.tsx"),
  // Accept an invitation (S-029): public, the token in the path is the credential.
  route("admin/invite/:token", "routes/admin/invite.tsx"),
  // Signed upload URLs as JSON (resource route, guarded like any admin module; S-047).
  route("admin/uploads", "routes/admin/uploads.tsx"),
  // Customer view of any product (S-051): outside the frame so it looks like the live page.
  route("admin/menu/:id/preview", "routes/admin/product-preview.tsx"),
  route("admin", "routes/admin/layout.tsx", [
    index("routes/admin/home.tsx"),
    route("orders", "routes/admin/orders.tsx"),
    route("orders/:id", "routes/admin/order.tsx"),
    // Bottom bar and More (S-033); "Not available yet" placeholders until later epics build them.
    route("calendar", "routes/admin/calendar.tsx"),
    route("menu", "routes/admin/menu.tsx"),
    route("menu/new", "routes/admin/product.tsx", { id: "admin-product-new" }),
    route("menu/:id", "routes/admin/product.tsx", { id: "admin-product" }),
    route("more", "routes/admin/more.tsx"),
    route("gallery", "routes/admin/gallery.tsx"),
    route("customers", "routes/admin/customers.tsx"),
    route("sales", "routes/admin/sales.tsx"),
    route("profile", "routes/admin/profile.tsx"),
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
  // Supabase Auth Send Email hook (S-024) and the emailed link's landing (S-026).
  route("hooks/supabase/send-email", "routes/hooks/send-email.ts"),
  route("auth/confirm", "routes/auth/confirm.ts"),
];

export default [
  ...resourceRoutes,
  ...adminPages,
  layout("routes/site/layout.tsx", { id: "site-en" }, customerPages("en")),
  route("fr", "routes/site/layout.tsx", { id: "site-fr" }, customerPages("fr")),
] satisfies RouteConfig;
