// E-13 S-250: Gallery: editable intro, photos in the admin's order (2 columns on phones, 3
// from md), sized and lazy below the first row, captions as text, no lightbox, 24 then
// "Show more", the "coming soon" empty state, the error state, and removals within 60 s.
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { clearSitePageCache } from "~/server/services/site-page.server";
import { links, renderInSite } from "~/server/testing/render-in-site";
import { routeArgs } from "~/server/testing/route-context";
import Gallery, { loader } from "./gallery";

type LoaderData = Parameters<typeof Gallery>[0]["loaderData"];
const photo = (n: number, caption: string | null = null) => ({ id: null as string | null, url: `https://cdn.test/g${n}.webp`, width: 800, height: 800, alt: caption ?? "A cake by Aux petits bonheurs", caption });

function render(data: Partial<LoaderData>, path = "/gallery") {
  const loaderData = { title: "", description: "", indexable: true, page: { key: "gallery", isPlaceholder: false, text: { intro: "Some of our cakes." }, photos: [], event: null }, photos: [], total: 0, ...data } as LoaderData;
  return renderInSite(<Gallery {...({ loaderData } as unknown as Parameters<typeof Gallery>[0])} />, path);
}

describe("view", () => {
  test("AC1: h1, intro and a grid of 2 columns (3 from md) with sized photos, the first row eager", () => {
    const html = render({ photos: [photo(1, "Wedding cake"), photo(2), photo(3)], total: 3 });

    expect(html).toMatch(/<h1[^>]*>Gallery<\/h1>/);
    expect(html).toContain("Some of our cakes.");
    expect(html).toContain('class="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4"');
    expect(html).toContain('<img src="https://cdn.test/g1.webp" alt="Wedding cake" width="800" height="800" loading="eager"');
    expect(html).toContain('<img src="https://cdn.test/g3.webp" alt="A cake by Aux petits bonheurs" width="800" height="800" loading="lazy"');
  });

  test("S-276 AC3: tiles with smaller copies carry srcset and the tile sizes", () => {
    const srcSet = "https://cdn.test/g1-480w.webp 480w, https://cdn.test/g1.webp 800w";
    const html = render({ photos: [{ ...photo(1), srcSet }], total: 1 });

    const img = html.match(/<img[^>]*g1\.webp"[^>]*>/)![0];
    expect(img).toMatch(new RegExp(`srcSet="${srcSet}"`, "i"));
    expect(img).toContain('sizes="(min-width: 72rem) 22rem, (min-width: 48rem) 31vw, calc(50vw - 1.5rem)"');
    expect(img).toMatch(/fetchPriority="high"/i);
  });

  test("E-08 S-154 AC5: each photo links to the request form with it attached; the name includes its alt text; French at /fr", () => {
    const html = render({ photos: [{ ...photo(1, "Wedding cake"), id: "0b6a6c1e-4a4f-4d0e-9f53-2a1b3c4d5e6f" }], total: 1 });
    expect(html).toContain('href="/custom-cake?fromGallery=0b6a6c1e-4a4f-4d0e-9f53-2a1b3c4d5e6f"');
    expect(html).toContain('aria-label="Request something similar to: Wedding cake"');
    const fr = render({ photos: [{ ...photo(1, "Gâteau"), id: "0b6a6c1e-4a4f-4d0e-9f53-2a1b3c4d5e6f" }], total: 1 }, "/fr/gallery");
    expect(fr).toContain('href="/fr/custom-cake?fromGallery=0b6a6c1e-4a4f-4d0e-9f53-2a1b3c4d5e6f"');
    expect(fr).toContain(">Demander quelque chose de similaire<");
  });

  test("AC1: in French the heading is French", () => {
    expect(render({ photos: [photo(1)], total: 1 }, "/fr/gallery")).toMatch(/<h1[^>]*>Galerie<\/h1>/);
  });

  test("AC2: no photos: 'Photos coming soon.' with links to the collection, never an empty grid", () => {
    const html = render({ photos: [], total: 0 });

    expect(html).toContain("Photos coming soon.");
    expect(html).not.toContain("<ul");
    expect(links(html).find((l) => l.href === "/menu")?.text).toBe("See our collection");
  });

  test("AC2: a failed read shows the error with Retry", () => {
    expect(render({ page: null })).toContain("We could not load this page.");
  });

  test("AC3: more than shown: a Show more link (works without JavaScript)", () => {
    const html = render({ photos: Array.from({ length: 24 }, (_, i) => photo(i)), total: 30 });

    expect(links(html).find((l) => l.text === "Show more photos")?.href).toBe("/gallery?more=1");
  });

  test("AC4: plain images with the caption below as text, no lightbox button or link", () => {
    const html = render({ photos: [photo(1, "Wedding cake")], total: 1 });

    expect(html).toContain("<figcaption");
    expect(html).toContain(">Wedding cake</figcaption>");
    expect(html).not.toMatch(/<figure[^>]*>\s*<(a|button)/);
  });
});

describe("loader", () => {
  let database: TestDatabase;
  beforeAll(async () => {
    database = await createTestDatabase();
    const values = Array.from({ length: 30 }, (_, i) => `('gallery/p${i}.webp', 800, 800, ${i})`).join(",");
    await database.client.exec(`insert into gallery_photo (storage_path, width, height, sort_order) values ${values}`);
  }, 60_000);
  afterAll(async () => {
    clearSitePageCache();
    vi.useRealTimers();
    await database.close();
  });

  const load = async (path: string) => (await loader(routeArgs(database, { path }) as never)) as { photos: { url: string }[]; total: number; indexable: boolean };

  test("AC3: the first 24 in order, then all with ?more=1", async () => {
    clearSitePageCache();
    const first = await load("/gallery");
    const all = await load("/gallery?more=1");

    expect(first.photos).toHaveLength(24);
    expect(first.total).toBe(30);
    expect(first.photos[0]!.url).toMatch(/gallery\/p0\.webp$/);
    expect(all.photos).toHaveLength(30);
  });

  test("AC6: a photo deleted in admin is gone within 60 s", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-12T08:00:00Z"));
    clearSitePageCache();
    await load("/gallery");
    await database.client.query("delete from gallery_photo where storage_path = 'gallery/p0.webp'");

    vi.setSystemTime(new Date("2026-11-12T08:01:01Z"));
    const after = await load("/gallery");

    expect(after.total).toBe(29);
    expect(after.photos[0]!.url).toMatch(/gallery\/p1\.webp$/);
  });

  test("S-254: a cold isolate reads the page text and the photos in one query, then none", async () => {
    clearSitePageCache();
    const query = vi.spyOn(database.client, "query");

    const first = await load("/gallery");
    expect(query).toHaveBeenCalledTimes(1);
    await load("/fr/gallery");
    expect(query).toHaveBeenCalledTimes(1);
    expect(first.total).toBeGreaterThan(24);
    query.mockRestore();
  });

  test("FR-081: the seeded intro is sample text: noindex", async () => {
    expect((await load("/gallery")).indexable).toBe(false);
  });
});
