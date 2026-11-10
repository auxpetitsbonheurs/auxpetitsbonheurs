// Builds loader/action arguments for route unit tests: a real (PGlite) database in the
// request context, a fixed clock and an optional basket cookie.
import { RouterContextProvider } from "react-router";
import type { TestDatabase } from "~/db/testing/pglite";
import { clockContext } from "~/server/clock.server";
import { type RequestDb, requestDbContext } from "~/server/db.server";
import { publicConfigContext } from "~/server/public-config.server";

export const TEST_SUPABASE_URL = "https://storage.test";

export interface RouteArgsOptions {
  path: string;
  params?: Record<string, string>;
  form?: Record<string, string>;
  cookie?: string;
  now?: string;
}

export function routeArgs(database: TestDatabase, options: RouteArgsOptions) {
  const url = new URL(options.path, "http://localhost");
  const headers = new Headers(options.cookie ? { cookie: options.cookie } : {});
  const request = options.form
    ? new Request(url, { method: "POST", headers, body: new URLSearchParams(options.form) })
    : new Request(url, { headers });
  const context = new RouterContextProvider();
  context.set(requestDbContext, { db: database.db as unknown as RequestDb["db"], close: async () => {} });
  const now = new Date(options.now ?? "2026-11-10T08:00:00Z");
  context.set(clockContext, { now: () => now });
  context.set(publicConfigContext, { supabaseUrl: TEST_SUPABASE_URL });
  return { request, url, params: options.params ?? {}, context, pattern: "" };
}

/** The cookie value a Set-Cookie header stores, ready to send back as `name=value`. */
export function cookieFrom(setCookie: string | null): string {
  if (!setCookie) throw new Error("no Set-Cookie header");
  return setCookie.slice(0, setCookie.indexOf(";"));
}
