// GET /admin/sw.js (S-035 AC2, AC6; contracts.md "static"): the service worker script,
// public, `no-cache` so an installed worker revalidates it on every update check. Served
// from /admin/ so its scope is /admin/ (the customer site is never controlled by it).
import { SERVICE_WORKER_SOURCE } from "~/lib/sw-handlers";

export function loader() {
  return new Response(SERVICE_WORKER_SOURCE, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "no-cache",
      "Service-Worker-Allowed": "/admin/",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
