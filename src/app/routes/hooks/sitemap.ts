// GET /sitemap.xml (S-253 AC4..AC6, FR-081; S-224 adds the product pages): the indexable
// customer pages in English and French with hreflang alternates. Content pages that still hold
// placeholder text stay out (server/seo-pages.server.ts); product pages are listed under their
// current slug while a customer can open them (not hidden, in season today, Mauritius time);
// workshop pages while published and upcoming (E-15, tidy job).
// Never lists admin, basket, order, tracking, account or the no-JavaScript menu page.
import { todayMU } from "~/domain/time";
import { sitemapXml } from "~/lib/sitemap";
import { clockContext } from "~/server/clock.server";
import { requestDbContext } from "~/server/db.server";
import { sitemapPaths } from "~/server/seo-pages.server";
import type { Route } from "./+types/sitemap";

export async function loader({ url, context }: Route.LoaderArgs) {
  const paths = await sitemapPaths(context.get(requestDbContext).db, todayMU(context.get(clockContext).now()));
  return new Response(sitemapXml(url.origin, paths), {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
