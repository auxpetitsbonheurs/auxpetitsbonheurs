// Who may open each admin module (FR-039, FR-041; spec "Permissions matrix").
// Keyed by the route file's name under routes/admin/. route-guards.test.ts fails when a
// route under /admin has no entry here, so every new module states its policy.
//   public - no session needed (sign-in and recovery pages)
//   admin  - any active admin, Owner or Admin (`requireAdmin(args)`)
//   owner  - Owners only (`requireAdmin(args, { role: "owner" })`); Admins get 403
export type AdminModulePolicy = "public" | "admin" | "owner";

export const ADMIN_MODULE_POLICY = {
  login: "public",
  "sign-out": "public",
  invite: "public",
  forgot: "public",
  reset: "public",
  manifest: "public",
  sw: "public",
  layout: "admin",
  home: "admin",
  orders: "admin",
  order: "admin",
  // Add order and its customer lookup (E-07 S-131..S-135): Admins and Owners (FR-041).
  "order-new": "admin",
  "customer-lookup": "admin",
  "order-edit": "admin",
  // Invoice of an order (S-127): JSON for the browser-built PDF and the printable page; whoever sees the order.
  "invoice-data": "admin",
  "order-invoice": "admin",
  "not-found": "admin",
  more: "admin",
  calendar: "admin",
  // Prep list of one day (E-07 S-139, S-140): whoever sees the calendar.
  "calendar-prep": "admin",
  menu: "admin",
  product: "admin",
  "product-preview": "admin",
  uploads: "admin",
  promotions: "admin",
  promotion: "admin",
  gallery: "admin",
  customers: "admin",
  customer: "admin",
  sales: "admin",
  // Sales summary CSV download (E-09 S-178, S-179): same audience as Sales.
  "sales-csv": "admin",
  profile: "admin",
  // Brand pages (E-13 S-246, S-247): Admins may edit page content (Lead decision 1, 2026-11-12).
  pages: "admin",
  // Bakery reviews (E-14 S-263): Admins and Owners moderate, like menu and gallery (epic decision 7).
  reviews: "admin",
  "page-editor": "admin",
  team: "owner",
  settings: "owner",
  availability: "owner",
} as const satisfies Record<string, AdminModulePolicy>;

export type AdminModule = keyof typeof ADMIN_MODULE_POLICY;

function modulesWith(policy: AdminModulePolicy): AdminModule[] {
  return (Object.keys(ADMIN_MODULE_POLICY) as AdminModule[]).filter((name) => ADMIN_MODULE_POLICY[name] === policy);
}

export const PUBLIC_ADMIN_MODULES = modulesWith("public");
/** Availability, Settings and Team (FR-041): hidden from Admins in More and refused on the server. */
export const OWNER_ONLY_MODULES = modulesWith("owner");
