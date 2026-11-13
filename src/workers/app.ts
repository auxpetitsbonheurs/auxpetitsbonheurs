import { RouterContextProvider, createRequestHandler } from "react-router";
import { dispatch } from "~/jobs/dispatch";
import { afterResponseContext, createAfterResponse } from "~/server/after-response.server";
import { authContext } from "~/server/auth-gateway.server";
import { clockContext, createClock } from "~/server/clock.server";
import { confirmationContext, confirmationSignerFor } from "~/server/confirmation-cookie.server";
import { handleWithDb, requestDbContext } from "~/server/db.server";
import { type ServerEnv, getEnv } from "~/server/env.server";
import { EMAIL_TIMEOUT_MS, resendMailer } from "~/server/email/sender.server";
import { backgroundContext, emailContext } from "~/server/email/context.server";
import { integrationConfigured } from "~/lib/integrations";
import { refuseCrossSiteAdminRequest } from "~/server/origin.server";
import { publicConfigContext } from "~/server/public-config.server";
import { withDbTiming } from "~/server/db-timing.server";
import { ServerTiming, serverTimingContext } from "~/server/server-timing.server";
import { requestPhotosContext, storageContext, supabaseStorage, uploadContext } from "~/server/storage.server";
import { turnstileContext, turnstileFromEnv } from "~/server/turnstile.server";
import { createSupabaseAuth } from "~/server/supabase-auth.server";
import { supabaseUserAdmin, userAdminContext } from "~/server/user-admin.server";
import { withEnvironmentHeaders, withServerTiming } from "./headers";
import { requestLogLine } from "./log-redact";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

async function respond(request: Request, settings: ServerEnv, ctx: ExecutionContext, timing: ServerTiming): Promise<Response> {
  // CSRF: cross-site admin mutations stop here with 403, before any database or auth work.
  const refused = refuseCrossSiteAdminRequest(request);
  if (refused) return refused;
  // Emails, push, error reports and Storage clean-up run after the response (ADR-0003 amendment 3).
  const afterResponse = createAfterResponse((promise) => ctx.waitUntil(promise));
  return handleWithDb(settings.DATABASE_URL, ctx, (requestDb) => {
    const context = new RouterContextProvider();
    context.set(requestDbContext, requestDb);
    context.set(afterResponseContext, afterResponse);
    context.set(serverTimingContext, timing);
    context.set(publicConfigContext, { supabaseUrl: settings.SUPABASE_URL, supabaseAnonKey: settings.SUPABASE_ANON_KEY });
    context.set(clockContext, createClock({ testClock: settings.TEST_CLOCK === "on" }, request));
    // Signed confirmation cookie (checkout AC48): its key is derived from a server-only secret, never the secret itself.
    context.set(confirmationContext, confirmationSignerFor(settings.SUPABASE_SERVICE_ROLE_KEY));
    // Supabase Auth for this request (lazy: no client until a guard or sign-in needs it).
    context.set(authContext, createSupabaseAuth({ url: settings.SUPABASE_URL, anonKey: settings.SUPABASE_ANON_KEY }, request));
    // Storage with the service key, server side only: removing photos of deleted products,
    // signing upload URLs and checking stored uploads (the key never reaches the browser).
    const storage = supabaseStorage({ url: settings.SUPABASE_URL, serviceRoleKey: settings.SUPABASE_SERVICE_ROLE_KEY });
    context.set(storageContext, storage);
    context.set(uploadContext, storage);
    // Customer request photos (E-08): the private bucket, same key, signed uploads and reads.
    context.set(requestPhotosContext, storage);
    // Bot check on the public custom cake form (S-162); skipped until both Turnstile keys are set.
    context.set(turnstileContext, turnstileFromEnv(settings));
    // Auth Admin API (service key, server only): creating an invited admin's account (S-029).
    context.set(userAdminContext, supabaseUserAdmin({ url: settings.SUPABASE_URL, serviceRoleKey: settings.SUPABASE_SERVICE_ROLE_KEY }));
    // Email (S-024): optional integrations; without their keys the hook answers a safe 500
    // and the forgot page still shows its calm message (ADR-0002 amendment).
    context.set(emailContext, {
      mailer: integrationConfigured(settings, "email") ? resendMailer({ apiKey: settings.RESEND_API_KEY!, from: settings.EMAIL_FROM! }) : null,
      hookSecret: settings.SUPABASE_AUTH_HOOK_SECRET ?? null,
      timeoutMs: EMAIL_TIMEOUT_MS,
    });
    context.set(backgroundContext, { waitUntil: (promise) => ctx.waitUntil(promise) });
    return requestHandler(request, context);
  }, undefined, { idempotent: request.method === "GET" || request.method === "HEAD", afterResponse });
}

export default {
  async fetch(request, env, ctx) {
    const started = Date.now();
    // Fails loudly (variable names only) when a binding or secret is missing.
    const settings = getEnv(env);
    // Server-Timing: db-connect, each db-query, named reads and the whole app (no SQL, no PII).
    const timing = new ServerTiming();
    const response = await withDbTiming(timing, () => timing.measure("app", () => respond(request, settings, ctx, timing)));
    // One structured line per request, tokens redacted (S-019 AC5, NFR-004).
    console.log(JSON.stringify(requestLogLine(request, response.status, Date.now() - started)));
    return withEnvironmentHeaders(withServerTiming(response, timing.header()), settings.APP_ENV);
  },
  // Hourly cron (see wrangler.jsonc). app/jobs/dispatch runs the due jobs by Mauritius
  // local time (keepAlive every tick; later epics add their jobs there). Never throws.
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(dispatch(new Date(controller.scheduledTime), env, ctx));
  },
} satisfies ExportedHandler<Env>;
