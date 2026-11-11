// GET /api/menu (ADR-0004, contracts.md "Webhooks and resource endpoints"): the public menu
// and checkout Settings, versioned by ETag. If-None-Match on the current version answers 304
// with no body; browsers may reuse an answer for 60 s and revalidate in the background.
import { loadMenu } from "~/server/menu.server";
import { requestDbContext } from "~/server/db.server";
import { publicConfigContext } from "~/server/public-config.server";
import { clockContext } from "~/server/clock.server";
import { timed } from "~/server/server-timing.server";
import type { Route } from "./+types/menu";

export const MENU_CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=600";

/** True when an If-None-Match header names `etag` (weak or strong, or `*`). */
export function etagMatches(header: string | null, etag: string): boolean {
  if (!header) return false;
  return header.split(",").some((tag) => {
    const value = tag.trim().replace(/^W\//, "");
    return value === "*" || value === etag;
  });
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const menu = await timed(context, "menu", () =>
    loadMenu({ db: context.get(requestDbContext).db, supabaseUrl: context.get(publicConfigContext).supabaseUrl, now: context.get(clockContext).now() }),
  );
  const etag = `"${menu.v}"`;
  const headers = { ETag: etag, "Cache-Control": MENU_CACHE_CONTROL, Vary: "Accept-Encoding" };
  if (etagMatches(request.headers.get("if-none-match"), etag)) return new Response(null, { status: 304, headers });
  return Response.json(menu, { headers });
}
