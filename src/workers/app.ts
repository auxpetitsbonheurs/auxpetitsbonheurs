import { RouterContextProvider, createRequestHandler } from "react-router";
import { dispatch } from "~/jobs/dispatch";
import { authContext } from "~/server/auth-gateway.server";
import { clockContext, createClock } from "~/server/clock.server";
import { handleWithDb, requestDbContext } from "~/server/db.server";
import { type ServerEnv, getEnv } from "~/server/env.server";
import { refuseCrossSiteAdminRequest } from "~/server/origin.server";
import { publicConfigContext } from "~/server/public-config.server";
import { withDbTiming } from "~/server/db-timing.server";
import { ServerTiming, serverTimingContext } from "~/server/server-timing.server";
import { createSupabaseAuth } from "~/server/supabase-auth.server";
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
  return handleWithDb(settings.DATABASE_URL, ctx, (requestDb) => {
    const context = new RouterContextProvider();
    context.set(requestDbContext, requestDb);
    context.set(serverTimingContext, timing);
    context.set(publicConfigContext, { supabaseUrl: settings.SUPABASE_URL, supabaseAnonKey: settings.SUPABASE_ANON_KEY });
    context.set(clockContext, createClock({ testClock: settings.TEST_CLOCK === "on" }, request));
    // Supabase Auth for this request (lazy: no client until a guard or sign-in needs it).
    context.set(authContext, createSupabaseAuth({ url: settings.SUPABASE_URL, anonKey: settings.SUPABASE_ANON_KEY }, request));
    return requestHandler(request, context);
  }, undefined, { idempotent: request.method === "GET" || request.method === "HEAD" });
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
