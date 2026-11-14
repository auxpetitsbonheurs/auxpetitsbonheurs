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
    // Our collection (S-244) and the phone menu's no-JavaScript page (S-243 AC8).
    route("menu", "routes/site/menu.tsx", { id: `menu-${locale}` }),
    route("menu-links", "routes/site/menu-links.tsx", { id: `menu-links-${locale}` }),
    // The E-13 nav pages: brand pages from the admin Pages content (S-248..S-250; old /about
    // answers 301, S-248 AC7), Contact us (S-251) and Custom order, interim until the E-08
    // request form (S-252).
    route("our-story", "routes/site/our-story.tsx", { id: `our-story-${locale}` }),
    route("about", "routes/site/about-redirect.ts", { id: `about-${locale}` }),
    route("workshops", "routes/site/workshops.tsx", { id: `workshops-${locale}` }),
    route("gallery", "routes/site/gallery.tsx", { id: `gallery-${locale}` }),
    route("contact", "routes/site/contact.tsx", { id: `contact-${locale}` }),
    // The short privacy note (S-225, NFR-004), linked from the footer and every form that asks for details.
    route("privacy", "routes/site/privacy.tsx", { id: `privacy-${locale}` }),
    route("custom-cake", "routes/site/custom-order.tsx", { id: `custom-cake-${locale}` }),
    route("menu/:slug", "routes/site/product.tsx", { id: `product-${locale}` }),
    route("basket", "routes/site/basket.tsx", { id: `basket-${locale}` }),
    route("order/:token/confirmed", "routes/site/order-confirmed.tsx", { id: `order-confirmed-${locale}` }),
    route("t/:token", "routes/site/tracking.tsx", { id: `tracking-${locale}` }),
    // Bakery reviews (E-14): the public page (S-267) and the signed-in customer's form (S-262).
    route("reviews", "routes/site/reviews.tsx", { id: `reviews-${locale}` }),
    route("reviews/write", "routes/site/review-write.tsx", { id: `review-write-${locale}` }),
    // Customer accounts (E-11): optional, never needed to order. Private, own text bundle.
    layout("routes/account/layout.tsx", { id: `account-${locale}` }, [
      route("account", "routes/account/profile.tsx", { id: `account-profile-${locale}` }),
      route("account/sign-in", "routes/account/sign-in.tsx", { id: `account-sign-in-${locale}` }),
      route("account/sign-up", "routes/account/sign-up.tsx", { id: `account-sign-up-${locale}` }),
      route("account/reset", "routes/account/reset.tsx", { id: `account-reset-${locale}` }),
      route("account/sign-out", "routes/account/sign-out.tsx", { id: `account-sign-out-${locale}` }),
      route("account/orders", "routes/account/orders.tsx", { id: `account-orders-${locale}` }),
      route("account/save-details", "routes/account/save-details.tsx", { id: `account-save-details-${locale}` }),
    ]),
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
  // Sales summary CSV (E-09 S-178, S-179): a file download, outside the frame; guarded itself.
  route("admin/sales.csv", "routes/admin/sales-csv.tsx"),
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
    // Promotions (S-052 list, S-053 editor).
    route("promotions", "routes/admin/promotions.tsx"),
    route("promotions/new", "routes/admin/promotion.tsx", { id: "admin-promotion-new" }),
    route("promotions/:id", "routes/admin/promotion.tsx", { id: "admin-promotion" }),
    route("gallery", "routes/admin/gallery.tsx"),
    route("customers", "routes/admin/customers.tsx"),
    route("customers/:id", "routes/admin/customer.tsx"),
    route("sales", "routes/admin/sales.tsx"),
    route("profile", "routes/admin/profile.tsx"),
    // Brand pages text and photos (E-13 S-246, S-247): Admins and Owners.
    // Bakery reviews to approve, published and not published (E-14 S-263, S-265): Admins and Owners.
    route("reviews", "routes/admin/reviews.tsx"),
    route("pages", "routes/admin/pages.tsx"),
    route("pages/:key", "routes/admin/page-editor.tsx"),
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
  // Search engines (S-253): indexable pages with hreflang alternates, and the crawl rules.
  route("sitemap.xml", "routes/hooks/sitemap.ts"),
  route("robots.txt", "routes/hooks/robots.ts"),
  route("api/basket/reissue", "routes/hooks/basket-reissue.ts"),
  // Promo banner Dismiss (S-062): the session cookie, with or without JavaScript.
  route("api/banner/dismiss", "routes/hooks/banner-dismiss.ts"),
  // Custom cake request photos (E-08 S-153): signed upload URLs to the private bucket.
  route("api/custom-cake/uploads", "routes/hooks/request-uploads.ts"),
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
