// S-317 AC2: on the first load the loader's markup is there but hidden: no shown veil, no status
// role or text, and the badge has no src or srcset, so it requests nothing during the first paint.
import { describe, expect, test } from "vitest";
import { renderInSite } from "~/server/testing/render-in-site";
import { PageLoader } from "./page-loader";

describe("PageLoader", () => {
  const html = renderInSite(<PageLoader />, "/");

  test("AC2: the server render is the hidden overlay: no data-show, no status role, no text", () => {
    expect(html).toContain('id="apb-page-loader"');
    expect(html).toContain('data-label="Loading…"');
    expect(html).toContain('aria-hidden="true" class="page-loader-veil" data-page-loader-veil="true"');
    expect(html).not.toContain("data-show");
    expect(html).not.toContain('role="status"');
    expect(html).toMatch(/<span class="sr-only" data-page-loader-text="true"><\/span>/);
  });

  test("AC2: the badge image starts with no src or srcset (loaded after load + idle)", () => {
    const image = /<img [^>]*>/.exec(html)?.[0] ?? "";
    expect(image).toContain('data-srcset="/brand/badge-cream-plain-200.webp 200w, /brand/badge-cream-plain-400.webp 400w"');
    expect(image).not.toMatch(/\ssrc(set)?=/);
    expect(image).toContain('alt=""');
  });
});
