// Builds loader/action arguments for route unit tests: a real (PGlite) database in the
// request context, a fixed clock, an in-process auth gateway (FakeAuth), optional
// cookies, and the Origin header a browser sends with a POST.
import { RouterContextProvider } from "react-router";
import { afterResponseContext, createAfterResponse } from "~/server/after-response.server";
import { authContext } from "~/server/auth-gateway.server";
import type { TestDatabase } from "~/db/testing/pglite";
import { clockContext } from "~/server/clock.server";
import { confirmationContext, confirmationSignerFor } from "~/server/confirmation-cookie.server";
import { type RequestDb, requestDbContext } from "~/server/db.server";
import { publicConfigContext } from "~/server/public-config.server";
import { type PushConfig, pushContext } from "~/server/push/push.server";
import { type RequestPhotoGateway, type StorageGateway, type UploadGateway, requestPhotosContext, storageContext, uploadContext } from "~/server/storage.server";
import { NO_TURNSTILE, type TurnstileCheck, turnstileContext } from "~/server/turnstile.server";
import { FakeAuth } from "./fake-auth";

export const TEST_SUPABASE_URL = "https://storage.test";
/** The server secret the confirmation cookie is signed with in route tests (a test value). */
export const TEST_CONFIRMATION_SECRET = "test-confirmation-secret";

export interface RouteArgsOptions {
  path: string;
  params?: Record<string, string>;
  /** POST body; an array posts the field once per value. */
  form?: Record<string, string | string[]>;
  cookie?: string;
  now?: string;
  auth?: FakeAuth;
  /** The POST's Origin header; defaults to the site's own, `null` leaves it out. */
  origin?: string | null;
  headers?: Record<string, string>;
  /** Storage double; defaults to one that accepts every removal. */
  storage?: StorageGateway | null;
  /** Upload double; defaults to none (uploads refused as INTERNAL). */
  uploads?: UploadGateway | null;
  /** Private request-photo bucket double (E-08); defaults to none. */
  requestPhotos?: RequestPhotoGateway | null;
  /** Bot check (S-162); defaults to the one that always passes. */
  turnstile?: TurnstileCheck;
  /** Web Push (S-196); defaults to off (no VAPID keys). */
  push?: PushConfig;
}

const acceptingStorage: StorageGateway = { remove: async () => {} };

function formBody(form: Record<string, string | string[]>): URLSearchParams {
  const body = new URLSearchParams();
  for (const [name, value] of Object.entries(form)) for (const v of Array.isArray(value) ? value : [value]) body.append(name, v);
  return body;
}

export function routeArgs(database: TestDatabase, options: RouteArgsOptions) {
  const url = new URL(options.path, "http://localhost");
  const headers = new Headers({ ...options.headers, ...(options.cookie ? { cookie: options.cookie } : {}) });
  const origin = options.origin === undefined ? url.origin : options.origin;
  if (options.form && origin !== null) headers.set("origin", origin);
  const request = options.form
    ? new Request(url, { method: "POST", headers, body: formBody(options.form) })
    : new Request(url, { headers });
  const context = new RouterContextProvider();
  context.set(requestDbContext, { db: database.db as unknown as RequestDb["db"], close: async () => {} });
  const now = new Date(options.now ?? "2026-11-10T08:00:00Z");
  context.set(clockContext, { now: () => now });
  context.set(authContext, (options.auth ?? new FakeAuth()).gateway(request, () => now));
  context.set(publicConfigContext, { supabaseUrl: TEST_SUPABASE_URL, supabaseAnonKey: "test-anon-key" });
  context.set(confirmationContext, confirmationSignerFor(TEST_CONFIRMATION_SECRET));
  context.set(storageContext, options.storage === undefined ? acceptingStorage : options.storage);
  context.set(uploadContext, options.uploads ?? null);
  context.set(requestPhotosContext, options.requestPhotos ?? null);
  context.set(turnstileContext, options.turnstile ?? NO_TURNSTILE);
  context.set(pushContext, options.push ?? { pusher: null, publicKey: null });
  // Deferred work starts at once (the response is "ready"); tests await `afterResponse.settled()`.
  const afterResponse = createAfterResponse(() => {});
  afterResponse.release();
  context.set(afterResponseContext, afterResponse);
  return { request, url, params: options.params ?? {}, context, pattern: "", afterResponse };
}

/** The cookie value a Set-Cookie header stores, ready to send back as `name=value`. */
export function cookieFrom(setCookie: string | null): string {
  if (!setCookie) throw new Error("no Set-Cookie header");
  return setCookie.slice(0, setCookie.indexOf(";"));
}
