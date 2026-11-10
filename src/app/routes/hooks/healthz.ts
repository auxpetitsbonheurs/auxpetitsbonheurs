// GET /healthz (S-020, contracts.md): 200 when the database and Auth answer, else 503 naming
// the failing part. For an optional free uptime monitor; never cached, no versions or errors.
import { checkHealth } from "~/server/health.server";
import { requestDbContext } from "~/server/db.server";
import { publicConfigContext } from "~/server/public-config.server";
import type { Route } from "./+types/healthz";

export async function loader({ context }: Route.LoaderArgs) {
  const config = context.get(publicConfigContext);
  const report = await checkHealth(context.get(requestDbContext).db, { url: config.supabaseUrl, anonKey: config.supabaseAnonKey });
  return Response.json(report, { status: report.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
