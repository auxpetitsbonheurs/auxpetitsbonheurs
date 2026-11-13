// E-08 photo tiles, server-rendered (S-152 AC8, AC10; S-153 AC6, AC9; S-154 AC1, AC6). Picking,
// shrinking, the 5-photo cap and retries run in a browser: tests/e2e/custom-request.spec.ts.
import { describe, expect, test } from "vitest";
import { renderInSite } from "~/server/testing/render-in-site";
import { PhotoPicker } from "./photo-picker";
import type { PhotoTile } from "./use-request-photos";

const noop = () => {};
const render = (tiles: PhotoTile[], extra: { problems?: string[]; error?: string } = {}, path = "/custom-cake") =>
  renderInSite(<PhotoPicker tiles={tiles} status="" problems={extra.problems ?? []} full={tiles.length >= 5} error={extra.error} onAdd={noop} onRemove={noop} onRetry={noop} />, path);

describe("photo tiles", () => {
  test("S-154 AC1/AC6: a gallery photo is tile 1, posted by id, with the unique name 'Remove photo 1'", () => {
    const html = render([{ key: "gallery", status: "done", previewUrl: "https://cdn.test/g.webp", galleryId: "g-1" }]);

    expect(html).toContain('<input type="hidden" name="galleryPhotoId" value="g-1"/>');
    expect(html).toContain('alt="Reference photo 1 from our gallery"');
    expect(html).toContain("Remove photo 1");
    expect(html).not.toContain('name="photoPaths"');
  });

  test("S-153 AC6: only uploaded tiles post a path; each tile's buttons say which photo", () => {
    const html = render([
      { key: "a", status: "done", previewUrl: "blob:a", path: "requests/s/a.webp" },
      { key: "b", status: "uploading", previewUrl: "blob:b" },
      { key: "c", status: "failed", previewUrl: "blob:c" },
    ]);

    expect(html.match(/name="photoPaths"/g)).toHaveLength(1);
    expect(html).toContain('value="requests/s/a.webp"');
    expect(html).toContain("Remove photo 2");
    expect(html).toContain("Uploading photo 2…");
    expect(html).toContain("Try again photo 3");
    expect(html).toContain("Remove photo 3");
  });

  test("S-153 AC9: a failed tile says so in words, not by colour alone", () => {
    const html = render([{ key: "c", status: "failed", previewUrl: "blob:c" }]);
    expect(html).toContain("Upload failed. Try again");
    expect(html).toContain('data-status="failed"');
  });

  test("S-152 AC10: alternative text is per photo, never one label copied across tiles", () => {
    const html = render([
      { key: "a", status: "done", previewUrl: "blob:a", path: "p/a" },
      { key: "b", status: "done", previewUrl: "blob:b", path: "p/b" },
    ]);
    expect(html).toContain('alt="Reference photo 1"');
    expect(html).toContain('alt="Reference photo 2"');
  });

  test("S-152 AC3/AC5: problems are listed and announced politely; French at /fr", () => {
    const html = render([], { problems: ["cv.pdf is not a photo we can use."] });
    expect(html).toContain("cv.pdf is not a photo we can use.");
    expect(html).toMatch(/role="status"[^>]*>cv\.pdf is not a photo we can use\./);
    expect(render([], {}, "/fr/custom-cake")).toContain("Les photos sont réduites sur votre téléphone");
  });

  test("S-152 AC6: with 5 photos the form says 5 photos maximum (once hydrated) and offers no add tile", () => {
    const five = Array.from({ length: 5 }, (_, i): PhotoTile => ({ key: `k${i}`, status: "done", previewUrl: `blob:${i}`, path: `p/${i}` }));
    expect(render(five)).not.toContain("Add photos");
  });
});
