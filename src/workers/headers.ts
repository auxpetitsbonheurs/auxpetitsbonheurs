// Headers that depend on the environment, stamped on every Worker response (S-002 AC7, NFR-010).
// Static assets are served by Cloudflare before the Worker and are not covered (they are not pages).

/** Only production may be indexed; staging and development say noindex on every response. */
export function withEnvironmentHeaders(response: Response, appEnv: "development" | "staging" | "production"): Response {
  if (appEnv === "production") return response;
  // Copy first: redirects and fetched responses have immutable headers.
  const copy = new Response(response.body, response);
  copy.headers.set("X-Robots-Tag", "noindex, nofollow");
  return copy;
}
