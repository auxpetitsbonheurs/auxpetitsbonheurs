// GET /admin/manifest.webmanifest (S-035 AC1, AC6; contracts.md "static"): public, no
// session read and no database; names, colours and icon paths only.
import { adminManifest } from "~/lib/admin-manifest";

export function loader() {
  return new Response(JSON.stringify(adminManifest()), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
