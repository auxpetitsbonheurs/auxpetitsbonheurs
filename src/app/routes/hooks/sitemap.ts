// GET /sitemap.xml (S-253 AC4..AC6, FR-081; S-071 adds product pages through the same helpers):
// the indexable customer pages in English and French with hreflang alternates. Content pages
// that still hold placeholder text stay out (server/seo-pages.server.ts). Never lists admin,
// basket, order, tracking, account or the no-JavaScript menu page.
import { sitemapXml } from "~/lib/sitemap";
import { requestDbContext } from "~/server/db.server";
import { sitemapPaths } from "~/server/seo-pages.server";
import type { Route } from "./+types/sitemap";

export async function loader({ url, context }: Route.LoaderArgs) {
  const paths = await sitemapPaths(context.get(requestDbContext).db);
  return new Response(sitemapXml(url.origin, paths), {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
