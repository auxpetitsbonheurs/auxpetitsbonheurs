// GET /robots.txt (S-253, S-224 AC4 and AC7, seo-metadata rule): crawl everything public, point
// at the sitemap. Private pages stay out in both languages: the admin app, the basket, order
// confirmations, tracking links and customer accounts (each is also noindex on its own). The
// admin app is also noindex by header; staging is noindex on every response (workers/).
// The Sitemap line uses the address the site is served on, so a custom domain needs no change.
import type { Route } from "./+types/robots";

const PRIVATE_PATHS = ["/admin", "/basket", "/order/", "/t/", "/account"];

export function loader({ url }: Route.LoaderArgs) {
  const disallow = [...PRIVATE_PATHS, ...PRIVATE_PATHS.filter((p) => p !== "/admin").map((p) => `/fr${p}`)].map((p) => `Disallow: ${p}`);
  const body = ["User-agent: *", ...disallow, "", `Sitemap: ${url.origin}/sitemap.xml`, ""].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
