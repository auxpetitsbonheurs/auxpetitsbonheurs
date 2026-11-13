// Responsive photo sizes (S-276): variant names, widths and the paths a removal covers.
import { describe, expect, test } from "vitest";
import { cleanVariantWidths, isVariantPath, typeOfPath, variantPath, variantSize, variantWidthsFor, withVariantPaths } from "./upload";

const PHOTO = "products/a/b/0b0f5d3e-2a4c-4e8b-9c1d-7e6f5a4b3c2d.webp";

describe("variant names (AC2: predictable, beside the original)", () => {
  test("a copy is the original's name with -<width>w before the extension", () => {
    expect(variantPath(PHOTO, 480)).toBe("products/a/b/0b0f5d3e-2a4c-4e8b-9c1d-7e6f5a4b3c2d-480w.webp");
    expect(variantPath("site/x.jpg", 960)).toBe("site/x-960w.jpg");
  });

  test("copies are told apart from originals", () => {
    expect(isVariantPath(PHOTO)).toBe(false);
    expect(isVariantPath(variantPath(PHOTO, 960))).toBe(true);
  });

  test("the extension says the stored type", () => {
    expect(typeOfPath(PHOTO)).toBe("image/webp");
    expect(typeOfPath("a.jpg")).toBe("image/jpeg");
    expect(typeOfPath("a.png")).toBe("image/png");
    expect(typeOfPath("a.gif")).toBeNull();
  });
});

describe("variant widths (AC1)", () => {
  test("only widths narrower than the photo are made", () => {
    expect(variantWidthsFor(1600)).toEqual([480, 960]);
    expect(variantWidthsFor(960)).toEqual([480]);
    expect(variantWidthsFor(480)).toEqual([]);
  });

  test("a copy keeps the photo's ratio", () => {
    expect(variantSize(1200, 1600, 480)).toEqual({ width: 480, height: 640 });
    expect(variantSize(1600, 1200, 960)).toEqual({ width: 960, height: 720 });
  });

  test("stored widths are cleaned for rendering: known, narrower than the photo, ascending, once", () => {
    expect(cleanVariantWidths([960, 480, 480, 1200], 1600)).toEqual([480, 960]);
    expect(cleanVariantWidths([960], 900)).toEqual([]);
    expect(cleanVariantWidths(undefined, 1600)).toEqual([]);
  });
});

describe("removals (AC7)", () => {
  test("each original takes every possible copy with it; copies and bundled samples are not expanded again", () => {
    expect(withVariantPaths([PHOTO, "/images/sample/cake.svg", variantPath(PHOTO, 480)])).toEqual([
      PHOTO,
      variantPath(PHOTO, 480),
      variantPath(PHOTO, 960),
      "/images/sample/cake.svg",
      variantPath(PHOTO, 480),
    ]);
  });
});
