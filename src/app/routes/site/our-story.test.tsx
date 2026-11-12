// E-13 S-248: Our story from the page read (S-245): one h1, intro and body as escaped plain
// paragraphs, photos with explicit size and locale alt, no empty blocks, error state, the
// collection link, noindex while sample text, and /about answering 301.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import type { PublicSitePage } from "~/server/services/site-page.server";
import { clearSitePageCache } from "~/server/services/site-page.server";
import { links, renderInSite } from "~/server/testing/render-in-site";
import { routeArgs } from "~/server/testing/route-context";
import { loader as aboutLoader } from "./about-redirect";
import OurStory, { loader, meta } from "./our-story";

const page = (overrides: Partial<PublicSitePage> = {}): PublicSitePage => ({ key: "our_story", isPlaceholder: false, text: { intro: "Welcome.", body: "First paragraph.\nSame paragraph.\n\nSecond paragraph." }, photos: [], event: null, ...overrides });

function render(loaderData: { page: PublicSitePage | null }, path = "/our-story") {
  return renderInSite(<OurStory {...({ loaderData: { title: "Our story", description: "", indexable: true, ...loaderData } } as unknown as Parameters<typeof OurStory>[0])} />, path);
}

describe("view", () => {
  test("AC1: one h1, the intro, the body as paragraphs (line breaks kept) and the photos with alt", () => {
    const html = render({ page: page({ photos: [{ url: "https://cdn.test/a.webp", width: 1200, height: 900, alt: "Our counter" }] }) });

    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toMatch(/<h1[^>]*>Our story<\/h1>/);
    expect(html).toContain(">Welcome.</p>");
    expect(html).toContain(">First paragraph.\nSame paragraph.</p>");
    expect(html).toContain(">Second paragraph.</p>");
    expect(html).toMatch(/<img src="https:\/\/cdn.test\/a.webp" alt="Our counter" width="1200" height="900" loading="lazy"/);
  });

  test("AC2: in French the heading is French and the page text is what the read gave", () => {
    const html = render({ page: page({ text: { intro: "Bienvenue." } }) }, "/fr/our-story");

    expect(html).toMatch(/<h1[^>]*>Notre histoire<\/h1>/);
    expect(html).toContain("Bienvenue.");
  });

  test("AC3: no photos and no body leave no empty image area or empty body block", () => {
    const html = render({ page: page({ text: { intro: "Only an intro." } }) });

    expect(html).not.toContain("<img");
    expect(html.match(/<p /g)?.length).toBe(2); // the intro and the collection link
  });

  test("AC4: HTML in the text is shown escaped, never as markup", () => {
    const html = render({ page: page({ text: { body: "<script>alert(1)</script><b>bold</b>" } }) });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;&lt;b&gt;bold&lt;/b&gt;");
  });

  test("AC5: a failed read shows the page error with Retry, not a blank page", () => {
    const html = render({ page: null });

    expect(html).toMatch(/<h1[^>]*>Our story<\/h1>/);
    expect(html).toContain("We could not load this page.");
    expect(html).toContain("Try again");
  });

  test("AC6: one clear next step to the collection, in the page language", () => {
    expect(links(render({ page: page() })).find((l) => l.href === "/menu")?.text).toBe("Browse our collection");
    expect(links(render({ page: page() }, "/fr/our-story")).find((l) => l.href === "/fr/menu")?.text).toBe("Voir notre collection");
  });

  test("FR-081: sample text is noindex; edited text is indexable", () => {
    const args = (indexable: boolean) =>
      ({
        loaderData: { title: "Our story", description: "d", indexable, page: page({ photos: [{ url: "https://cdn.test/a.webp", width: 1, height: 1, alt: "" }] }) },
        matches: [{ id: "root", loaderData: { origin: "https://apb.test" } }],
        location: { pathname: "/fr/our-story" },
      }) as never;
    expect(meta(args(false))).toContainEqual({ name: "robots", content: "noindex" });
    expect(meta(args(true))).not.toContainEqual({ name: "robots", content: "noindex" });
    // S-253 head: canonical in the page language, the page's first photo as the share image.
    expect(meta(args(true))).toContainEqual({ tagName: "link", rel: "canonical", href: "https://apb.test/fr/our-story" });
    expect(meta(args(true))).toContainEqual({ property: "og:image", content: "https://cdn.test/a.webp" });
  });
});

describe("loader", () => {
  let database: TestDatabase;
  beforeAll(async () => {
    database = await createTestDatabase();
  }, 60_000);
  afterAll(async () => {
    clearSitePageCache();
    await database.close();
  });

  test("AC1, AC5: the seeded page is sample text and not indexable", async () => {
    clearSitePageCache();
    const data = (await loader(routeArgs(database, { path: "/fr/our-story" }) as never)) as { page: PublicSitePage; indexable: boolean; title: string };

    expect(data.title).toBe("Notre histoire");
    expect(data.indexable).toBe(false);
    expect(data.page.text.intro).toMatch(/^Texte d'exemple/);
  });

  test("AC7: /about and /fr/about answer 301 to Our story in the same language", () => {
    for (const [from, to] of [
      ["/about", "/our-story"],
      ["/fr/about", "/fr/our-story"],
    ] as const) {
      let response: Response | undefined;
      try {
        aboutLoader({ url: new URL(from, "http://localhost") } as never);
      } catch (error) {
        response = error as Response;
      }
      expect(response?.status).toBe(301);
      expect(response?.headers.get("Location")).toBe(to);
    }
  });
});
