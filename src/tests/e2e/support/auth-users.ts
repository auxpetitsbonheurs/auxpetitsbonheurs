// Accounts the e2e harness seeds (auth.users + admin/customer rows) and the local
// GoTrue stub accepts. Placeholder credentials for a throwaway local database only.

export interface E2eAccount {
  id: string;
  email: string;
  password: string;
  name: string;
  kind: "admin" | "customer";
  role?: "owner" | "admin";
  active?: boolean;
  locale?: "en" | "fr";
}

const PASSWORD = "e2e-password-not-secret";

export const E2E_ACCOUNTS = {
  owner: { id: "00000000-0000-4000-8000-0000000000a1", email: "owner@e2e.test", password: PASSWORD, name: "E2E Owner", kind: "admin", role: "owner", active: true, locale: "en" },
  helper: { id: "00000000-0000-4000-8000-0000000000a2", email: "sarah@e2e.test", password: PASSWORD, name: "Sarah", kind: "admin", role: "admin", active: true, locale: "en" },
  french: { id: "00000000-0000-4000-8000-0000000000a3", email: "amelie@e2e.test", password: PASSWORD, name: "Amélie", kind: "admin", role: "admin", active: true, locale: "fr" },
  deactivated: { id: "00000000-0000-4000-8000-0000000000a4", email: "gone@e2e.test", password: PASSWORD, name: "Gone", kind: "admin", role: "admin", active: false, locale: "en" },
  customer: { id: "00000000-0000-4000-8000-0000000000c1", email: "customer@e2e.test", password: PASSWORD, name: "Cliente", kind: "customer" },
} as const satisfies Record<string, E2eAccount>;
