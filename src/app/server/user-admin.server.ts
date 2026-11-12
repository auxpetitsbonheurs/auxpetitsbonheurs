// Supabase Auth Admin API behind a seam (S-029): creating an invited admin's Auth user
// (confirmed, so no confirmation email) and removing it again when the admin row cannot
// be written (AC5). Uses the service key, server side only, with a 5 s deadline per call.
// workers/app.ts puts the Supabase-backed one in the context; unit tests put a fake.
import { createClient } from "@supabase/supabase-js";
import { createContext } from "react-router";
import type { Locale } from "~/lib/locale";

export type CreateUserResult = { ok: true; userId: string } | { ok: false; reason: "exists" | "weak" | "failed" };

export interface UserAdmin {
  /** A confirmed Auth user with this password; `exists` when the email already has one. */
  createUser(user: { email: string; password: string; name: string; locale: Locale }): Promise<CreateUserResult>;
  /** Removes an Auth user; `false` when it could not (the caller logs it). */
  deleteUser(userId: string): Promise<boolean>;
}

/** Each Admin API call must answer within 5 seconds (S-029 notes). */
export const USER_ADMIN_TIMEOUT_MS = 5000;

export interface SupabaseUserAdminConfig {
  url: string;
  serviceRoleKey: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

/** Codes GoTrue answers when the address already has an account. */
const EXISTS = new Set(["email_exists", "user_already_exists", "phone_exists"]);

export function supabaseUserAdmin(config: SupabaseUserAdminConfig): UserAdmin {
  const base = config.fetch ?? globalThis.fetch;
  const timeoutMs = config.timeoutMs ?? USER_ADMIN_TIMEOUT_MS;
  const bounded: typeof globalThis.fetch = (input, init) => base(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const admin = () =>
    createClient(config.url, config.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: bounded },
    }).auth.admin;
  return {
    async createUser({ email, password, name, locale }) {
      try {
        const { data, error } = await admin().createUser({ email, password, email_confirm: true, user_metadata: { name, locale } });
        if (!error && data.user) return { ok: true, userId: data.user.id };
        if (error?.code && EXISTS.has(error.code)) return { ok: false, reason: "exists" };
        if (error?.code === "weak_password") return { ok: false, reason: "weak" };
        return { ok: false, reason: "failed" };
      } catch {
        return { ok: false, reason: "failed" };
      }
    },
    async deleteUser(userId) {
      try {
        const { error } = await admin().deleteUser(userId);
        return !error;
      } catch {
        return false;
      }
    },
  };
}

/** No Admin API in this context (scripts, tests that never accept an invitation). */
const unavailable: UserAdmin = {
  createUser: async () => ({ ok: false, reason: "failed" }),
  deleteUser: async () => false,
};

export const userAdminContext = createContext<UserAdmin>(unavailable);
