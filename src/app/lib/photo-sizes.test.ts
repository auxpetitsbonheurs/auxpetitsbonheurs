import { describe, expect, test } from "vitest";
import * as SIZES from "./photo-sizes";

/** The slot width (CSS px) a browser takes from `sizes` at a viewport width (rem = 16 px). */
function slotWidth(sizes: string, viewport: number): number {
  const length = (value: string): number => {
    const calc = /^calc\((\d+(?:\.\d+)?)vw - (\d+(?:\.\d+)?)rem\)$/.exec(value);
    if (calc) return (Number(calc[1]) * viewport) / 100 - Number(calc[2]) * 16;
    if (value.endsWith("vw")) return (Number.parseFloat(value) * viewport) / 100;
    if (value.endsWith("rem")) return Number.parseFloat(value) * 16;
    throw new Error(`unsupported length ${value}`);
  };
  for (const entry of sizes.split(/,\s*(?![^(]*\))/)) {
    const media = /^\(min-width: (\d+(?:\.\d+)?)rem\) (.+)$/.exec(entry);
    if (!media) return length(entry);
    if (viewport >= Number(media[1]) * 16) return length(media[2]!);
  }
  throw new Error("no default slot");
}

/** Chrome's pick: the smallest candidate covering slot × DPR, else the widest. */
function pick(sizes: string, viewport: number, dpr: number, widths: number[]): number {
  const need = slotWidth(sizes, viewport) * dpr;
  return widths.find((w) => w >= need) ?? widths.at(-1)!;
}

const PIXEL_7 = [412, 2.625] as const;
const IPHONE_PRO = [393, 3] as const;

describe("photo sizes on phones (S-276 AC7)", () => {
  test.each([
    ["MENU_CARD_SIZES", SIZES.MENU_CARD_SIZES],
    ["CARD_SIZES", SIZES.CARD_SIZES],
    ["CATEGORY_SIZES", SIZES.CATEGORY_SIZES],
    ["GALLERY_TILE_SIZES", SIZES.GALLERY_TILE_SIZES],
    ["GALLERY_PREVIEW_SIZES", SIZES.GALLERY_PREVIEW_SIZES],
  ])("%s: a two-column card on a Pixel 7 takes the 480 px copy", (_name, sizes) => {
    expect(pick(sizes, ...PIXEL_7, [480, 960, 1200])).toBe(480);
  });

  test.each([
    ["HERO_SIZES", SIZES.HERO_SIZES],
    ["PRODUCT_VIEWER_SIZES", SIZES.PRODUCT_VIEWER_SIZES],
    ["PAGE_SINGLE_SIZES", SIZES.PAGE_SINGLE_SIZES],
    ["PAGE_PAIR_SIZES", SIZES.PAGE_PAIR_SIZES],
  ])("%s: a full-width phone photo takes the 960 px copy, not a slightly wider original", (_name, sizes) => {
    for (const original of [1024, 1200, 1600]) {
      expect(pick(sizes, ...PIXEL_7, [480, 960, original])).toBe(960);
      expect(pick(sizes, ...IPHONE_PRO, [480, 960, original])).toBe(960);
    }
    // Without a 960 copy the original still serves (never the blurry 480 copy at 2.6x).
    expect(pick(sizes, ...PIXEL_7, [480, 900])).toBe(900);
  });

  test("wide screens still get the original", () => {
    expect(pick(SIZES.HERO_SIZES, 1440, 2, [480, 960, 1600])).toBe(1600);
    expect(pick(SIZES.PRODUCT_VIEWER_SIZES, 1440, 2, [480, 960, 1600])).toBe(1600);
    // A tablet below the 48rem breakpoint is sized by its real width again.
    expect(pick(SIZES.HERO_SIZES, 600, 2, [480, 960, 1600])).toBe(1600);
  });
});
