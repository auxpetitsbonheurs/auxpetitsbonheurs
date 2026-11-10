import { createRequestHandler } from "react-router";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request) {
    return requestHandler(request);
  },
  // Hourly cron (see wrangler.jsonc). Jobs are dispatched by Mauritius local time:
  // quote expiry, 18:00 reminder, 24 h pending alert, email retries, promotions,
  // and the Supabase keep-alive query. Implemented in later stories.
  async scheduled(_controller, _env, _ctx) {
    // Intentionally empty until the jobs module exists.
  },
} satisfies ExportedHandler<Env>;
