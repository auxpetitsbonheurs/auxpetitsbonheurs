// GET /robots.txt (S-253, seo-metadata rule): crawl everything public, point at the sitemap.
// The admin app is also noindex by header; staging is noindex on every response (workers/).
import type { Route } from "./+types/robots";

export function loader({ url }: Route.LoaderArgs) {
  const body = ["User-agent: *", "Disallow: /admin", "", `Sitemap: ${url.origin}/sitemap.xml`, ""].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
