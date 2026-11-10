import { RouterContextProvider, createRequestHandler } from "react-router";
import { handleWithDb, requestDbContext } from "~/server/db.server";
import { getEnv } from "~/server/env.server";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    // Fails loudly (variable names only) when a binding or secret is missing.
    const settings = getEnv(env);
    return handleWithDb(settings.DATABASE_URL, ctx, (requestDb) => {
      const context = new RouterContextProvider();
      context.set(requestDbContext, requestDb);
      return requestHandler(request, context);
    });
  },
  // Hourly cron (see wrangler.jsonc). Jobs are dispatched by Mauritius local time:
  // quote expiry, 18:00 reminder, 24 h pending alert, email retries, promotions,
  // and the Supabase keep-alive query. Implemented in later stories.
  async scheduled(_controller, _env, _ctx) {
    // Intentionally empty until the jobs module exists.
  },
} satisfies ExportedHandler<Env>;
