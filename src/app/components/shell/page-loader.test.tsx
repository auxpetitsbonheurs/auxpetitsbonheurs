// S-317 AC2: on the first load the loader's markup is there but hidden: no shown veil, no status
// role or text, and the badge has no src or srcset, so it requests nothing during the first paint.
import { describe, expect, test } from "vitest";
import { renderInSite } from "~/server/testing/render-in-site";
import { LOADER_SCENES } from "~/lib/loader-scenes";
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

// S-321: every scene is in the markup once (the full-page-load script picks one before React
// starts), the whisk by default; CSS draws only the root's data-scene.
describe("PageLoader scenes (S-321)", () => {
  const html = renderInSite(<PageLoader />, "/");

  test("starts on the whisk and carries one group per scene", () => {
    expect(html).toContain('data-scene="whisk"');
    for (const scene of LOADER_SCENES) expect(html).toContain(`data-loader-scene="${scene}"`);
    expect(html.match(/data-loader-scene=/g)).toHaveLength(LOADER_SCENES.length);
  });

  test("the bowl is one shared shape", () => {
    expect(html.match(/id="apb-loader-bowl"/g)).toHaveLength(1);
    expect(html.match(/href="#apb-loader-bowl"/g)?.length).toBeGreaterThanOrEqual(4);
  });

  test("stays small: the whole overlay under 9 kB of HTML", () => {
    expect(html.length).toBeLessThan(9_000);
  });
});
