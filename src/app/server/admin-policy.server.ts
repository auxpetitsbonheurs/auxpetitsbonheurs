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
  layout: "admin",
  home: "admin",
  orders: "admin",
  order: "admin",
  "not-found": "admin",
  more: "admin",
  calendar: "admin",
  menu: "admin",
  product: "admin",
  uploads: "admin",
  promotions: "admin",
  gallery: "admin",
  customers: "admin",
  sales: "admin",
  profile: "admin",
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
