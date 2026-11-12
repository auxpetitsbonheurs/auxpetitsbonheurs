// Builds loader/action arguments for route unit tests: a real (PGlite) database in the
// request context, a fixed clock, an in-process auth gateway (FakeAuth), optional
// cookies, and the Origin header a browser sends with a POST.
import { RouterContextProvider } from "react-router";
import { authContext } from "~/server/auth-gateway.server";
import type { TestDatabase } from "~/db/testing/pglite";
import { clockContext } from "~/server/clock.server";
import { type RequestDb, requestDbContext } from "~/server/db.server";
import { publicConfigContext } from "~/server/public-config.server";
import { type StorageGateway, storageContext } from "~/server/storage.server";
import { FakeAuth } from "./fake-auth";

export const TEST_SUPABASE_URL = "https://storage.test";

export interface RouteArgsOptions {
  path: string;
  params?: Record<string, string>;
  form?: Record<string, string>;
  cookie?: string;
  now?: string;
  auth?: FakeAuth;
  /** The POST's Origin header; defaults to the site's own, `null` leaves it out. */
  origin?: string | null;
  headers?: Record<string, string>;
  /** Storage double; defaults to one that accepts every removal. */
  storage?: StorageGateway | null;
}

const acceptingStorage: StorageGateway = { remove: async () => {} };

export function routeArgs(database: TestDatabase, options: RouteArgsOptions) {
  const url = new URL(options.path, "http://localhost");
  const headers = new Headers({ ...options.headers, ...(options.cookie ? { cookie: options.cookie } : {}) });
  const origin = options.origin === undefined ? url.origin : options.origin;
  if (options.form && origin !== null) headers.set("origin", origin);
  const request = options.form
    ? new Request(url, { method: "POST", headers, body: new URLSearchParams(options.form) })
    : new Request(url, { headers });
  const context = new RouterContextProvider();
  context.set(requestDbContext, { db: database.db as unknown as RequestDb["db"], close: async () => {} });
  const now = new Date(options.now ?? "2026-11-10T08:00:00Z");
  context.set(clockContext, { now: () => now });
  context.set(authContext, (options.auth ?? new FakeAuth()).gateway(request, () => now));
  context.set(publicConfigContext, { supabaseUrl: TEST_SUPABASE_URL, supabaseAnonKey: "test-anon-key" });
  context.set(storageContext, options.storage === undefined ? acceptingStorage : options.storage);
  return { request, url, params: options.params ?? {}, context, pattern: "" };
}

/** The cookie value a Set-Cookie header stores, ready to send back as `name=value`. */
export function cookieFrom(setCookie: string | null): string {
  if (!setCookie) throw new Error("no Set-Cookie header");
  return setCookie.slice(0, setCookie.indexOf(";"));
}
