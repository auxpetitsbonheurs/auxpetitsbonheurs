// S-002 AC7 (NFR-010): staging is never indexed; production is.
import { describe, expect, test } from "vitest";
import { withEnvironmentHeaders } from "./headers";

describe("withEnvironmentHeaders", () => {
  test("staging responses carry X-Robots-Tag: noindex, nofollow", () => {
    const response = withEnvironmentHeaders(new Response("<h1>Hi</h1>", { status: 200, headers: { "Content-Type": "text/html" } }), "staging");

    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(response.headers.get("Content-Type")).toBe("text/html");
    expect(response.status).toBe(200);
  });

  test("development is not indexed either", () => {
    expect(withEnvironmentHeaders(new Response(null), "development").headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  test("production responses are left alone, so a page's own header stays", () => {
    const own = new Response(null, { headers: { "X-Robots-Tag": "noindex" } });

    expect(withEnvironmentHeaders(new Response(null), "production").headers.get("X-Robots-Tag")).toBeNull();
    expect(withEnvironmentHeaders(own, "production").headers.get("X-Robots-Tag")).toBe("noindex");
  });

  test("works on a redirect whose headers are immutable", () => {
    const response = withEnvironmentHeaders(Response.redirect("https://example.com/fr", 302), "staging");

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("https://example.com/fr");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });
});
