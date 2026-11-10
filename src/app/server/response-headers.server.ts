// Route middleware that stamps fixed headers on every response of a route: pages,
// client data requests, action results, thrown 404s and redirects alike.
import type { MiddlewareFunction } from "react-router";

export function responseHeaders(headers: Readonly<Record<string, string>>): MiddlewareFunction<Response> {
  return async (_args, next) => {
    const response = await next();
    for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
    return response;
  };
}

/** HTML that carries per-visitor data (basket, idempotency key) is never stored (architecture "Rendering"). */
export const noStore = responseHeaders({ "Cache-Control": "no-store" });
