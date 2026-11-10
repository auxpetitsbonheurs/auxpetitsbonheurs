import { RouterContextProvider, createRequestHandler } from "react-router";
import { authContext } from "~/server/auth-gateway.server";
import { clockContext, createClock } from "~/server/clock.server";
import { handleWithDb, requestDbContext } from "~/server/db.server";
import { getEnv } from "~/server/env.server";
import { refuseCrossSiteAdminRequest } from "~/server/origin.server";
import { publicConfigContext } from "~/server/public-config.server";
import { createSupabaseAuth } from "~/server/supabase-auth.server";
import { withEnvironmentHeaders } from "./headers";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    // Fails loudly (variable names only) when a binding or secret is missing.
    const settings = getEnv(env);
    // CSRF: cross-site admin mutations stop here with 403, before any database or auth work.
    const refused = refuseCrossSiteAdminRequest(request);
    if (refused) return withEnvironmentHeaders(refused, settings.APP_ENV);
    const response = await handleWithDb(settings.DATABASE_URL, ctx, (requestDb) => {
      const context = new RouterContextProvider();
      context.set(requestDbContext, requestDb);
      context.set(publicConfigContext, { supabaseUrl: settings.SUPABASE_URL });
      context.set(clockContext, createClock({ testClock: settings.TEST_CLOCK === "on" }, request));
      // Supabase Auth for this request (lazy: no client until a guard or sign-in needs it).
      context.set(authContext, createSupabaseAuth({ url: settings.SUPABASE_URL, anonKey: settings.SUPABASE_ANON_KEY }, request));
      return requestHandler(request, context);
    });
    return withEnvironmentHeaders(response, settings.APP_ENV);
  },
  // Hourly cron (see wrangler.jsonc). Jobs are dispatched by Mauritius local time:
  // quote expiry, 18:00 reminder, 24 h pending alert, email retries, promotions,
  // and the Supabase keep-alive query. Implemented in later stories.
  async scheduled(_controller, _env, _ctx) {
    // Intentionally empty until the jobs module exists.
  },
} satisfies ExportedHandler<Env>;
