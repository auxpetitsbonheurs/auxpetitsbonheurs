// What pages render for a photo (S-276 AC3, AC4): srcset from stored copies, else the original.
import { describe, expect, test } from "vitest";
import { photoOrigin, thumbnailUrl, webPhoto } from "./images";

describe("photoOrigin (S-276 AC7 preconnect)", () => {
  test("is the Supabase origin, without path or trailing slash", () => {
    expect(photoOrigin("https://abc.supabase.co/")).toBe("https://abc.supabase.co");
    expect(photoOrigin("http://127.0.0.1:54321")).toBe("http://127.0.0.1:54321");
  });

  test("is null when there is no usable URL", () => {
    expect(photoOrigin("")).toBeNull();
    expect(photoOrigin("not a url")).toBeNull();
  });
});

const SUPABASE = "https://proj.supabase.co/";
const BASE = "https://proj.supabase.co/storage/v1/object/public/public-images/products/a/b/p";

describe("webPhoto", () => {
  test("with stored copies: srcset lists each copy at its width, then the original; the smallest is the thumbnail", () => {
    expect(webPhoto("products/a/b/p.webp", 1200, 1600, [960, 480], SUPABASE)).toEqual({
      url: `${BASE}.webp`,
      width: 1200,
      height: 1600,
      srcSet: `${BASE}-480w.webp 480w, ${BASE}-960w.webp 960w, ${BASE}.webp 1200w`,
      thumbUrl: `${BASE}-480w.webp`,
    });
  });

  test("AC4: without copies (old row, failed upload) the original alone is used, with no srcset", () => {
    expect(webPhoto("products/a/b/p.jpg", 1024, 1536, [], SUPABASE)).toEqual({ url: `${BASE}.jpg`, width: 1024, height: 1536 });
  });

  test("a stored width the photo cannot have (not narrower, unknown) is ignored", () => {
    expect(webPhoto("products/a/b/p.webp", 900, 600, [960, 1200], SUPABASE).srcSet).toBeUndefined();
    expect(webPhoto("products/a/b/p.webp", 900, 600, [480, 960], SUPABASE).srcSet).toBe(`${BASE}-480w.webp 480w, ${BASE}.webp 900w`);
  });

  test("bundled sample images never get copies", () => {
    expect(webPhoto("/images/sample/cake.svg", 800, 600, [480], SUPABASE)).toEqual({ url: "/images/sample/cake.svg", width: 800, height: 600 });
  });

  test("thumbnails use the smallest copy, else the original", () => {
    expect(thumbnailUrl("products/a/b/p.webp", 1600, [480, 960], SUPABASE)).toBe(`${BASE}-480w.webp`);
    expect(thumbnailUrl("products/a/b/p.webp", 1600, [], SUPABASE)).toBe(`${BASE}.webp`);
  });
});
