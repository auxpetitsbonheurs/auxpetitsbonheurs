// S-284 AC3: the first page load carries no loader markup (no badge, no status), so it adds
// nothing to the first paint; the loader exists only while a client page change loads.
import { describe, expect, test } from "vitest";
import { renderInSite } from "~/server/testing/render-in-site";
import { PageLoader } from "./page-loader";

describe("PageLoader", () => {
  test("AC3: the server render (router idle) is empty", () => {
    const html = renderInSite(<PageLoader />, "/");
    expect(html).not.toContain("data-page-loader");
    expect(html).not.toContain('role="status"');
    expect(html).not.toContain("<img");
  });
});
