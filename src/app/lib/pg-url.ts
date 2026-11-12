// node-postgres (ADR-0003 amendment 3) reads `sslmode=require` as verify-full, unlike libpq
// and postgres.js, which encrypt without checking the certificate chain. Supabase's pooler
// certificate is signed by Supabase's own CA, so the GitHub Actions migrations and seeds (and
// the Worker's DATABASE_URL fallback) would stop connecting. `uselibpqcompat=true` keeps
// libpq's meaning of every sslmode. Dependency-free: drizzle.config.ts imports it too.

/** The same URL with libpq sslmode semantics for node-postgres; other URLs are returned unchanged. */
export function withLibpqSslModes(url: string): string {
  const query = url.split("?")[1];
  if (query === undefined) return url;
  const keys = new URLSearchParams(query);
  if (!keys.has("sslmode") || keys.has("uselibpqcompat")) return url;
  // Appended, not re-serialised: the rest of the URL (password included) stays byte for byte.
  return `${url}&uselibpqcompat=true`;
}
