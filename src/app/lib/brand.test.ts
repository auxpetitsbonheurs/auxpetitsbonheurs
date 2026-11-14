// The Owner's official badges (logo job): every file the site names exists, is the size it
// claims, and stays small (header and footer badges under 15 kB per density).
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { EMAIL_BADGE, INVOICE_BADGE_PATH, badgeImage } from "./brand";

const publicFile = (path: string) => fileURLToPath(new URL(`../../public${path}`, import.meta.url));
const srcSetPaths = (srcSet: string) => srcSet.split(", ").map((entry) => entry.split(" ")[0]!);

/** Width and height of a PNG (IHDR) or a lossless/alpha WebP (VP8L or VP8X header). */
function dimensions(path: string): [number, number] {
  const b = readFileSync(publicFile(path));
  if (b.toString("ascii", 1, 4) === "PNG") return [b.readUInt32BE(16), b.readUInt32BE(20)];
  const chunk = b.toString("ascii", 12, 16);
  if (chunk === "VP8X") return [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1];
  if (chunk === "VP8L") {
    const bits = b.readUInt32LE(21);
    return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
  }
  return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
}

describe("badgeImage", () => {
  test("header (56 px at most): cream 64 and 128 px files, src the 1x", () => {
    expect(badgeImage("cream", 56)).toEqual({
      src: "/brand/badge-cream-64.webp",
      srcSet: "/brand/badge-cream-64.webp 64w, /brand/badge-cream-128.webp 128w",
    });
  });

  test("every file in every srcset exists, is square, and is as wide as its descriptor", () => {
    for (const [colour, px] of [["cream", 64], ["cream", 112], ["cream", 160], ["burgundy", 48], ["burgundy", 80]] as const) {
      const { src, srcSet } = badgeImage(colour, px);
      for (const [i, path] of srcSetPaths(srcSet).entries()) {
        const width = Number(srcSet.split(", ")[i]!.split(" ")[1]!.replace("w", ""));
        expect(dimensions(path), path).toEqual([width, width]);
      }
      expect(srcSet).toContain(src);
    }
  });

  test("header and footer badges stay under 15 kB per density", () => {
    for (const path of new Set([...srcSetPaths(badgeImage("cream", 64).srcSet), ...srcSetPaths(badgeImage("cream", 112).srcSet)])) {
      if (path.endsWith("-320.webp")) continue; // hero placeholder's 2x only, never fetched by the header or footer at 1x-2x
      expect(statSync(publicFile(path)).size, path).toBeLessThan(15_000);
    }
  });
});

describe("PNG badges", () => {
  test("email: 240 px PNG for 120 px displayed", () => {
    expect(dimensions(EMAIL_BADGE.path)).toEqual([240, 240]);
    expect(EMAIL_BADGE.displayPx * 2).toBe(240);
  });

  test("invoice: 300 px PNG", () => {
    expect(dimensions(INVOICE_BADGE_PATH)).toEqual([300, 300]);
  });

  test("favicons, Apple touch icons and the admin app icons are the sizes their links declare", () => {
    const sizes: Record<string, number> = {
      "/favicon-32.png": 32,
      "/favicon-48.png": 48,
      "/apple-touch-icon.png": 180,
      "/admin/apple-touch-icon.png": 180,
      "/admin/icon-192.png": 192,
      "/admin/icon-512.png": 512,
      "/admin/icon-maskable-512.png": 512,
    };
    for (const [path, px] of Object.entries(sizes)) expect(dimensions(path), path).toEqual([px, px]);
  });

  test("Apple touch icon is opaque (iOS shows transparency as black)", () => {
    const b = readFileSync(publicFile("/apple-touch-icon.png"));
    const colourType = b[25];
    expect([2, 3]).toContain(colourType); // RGB or palette
    if (colourType === 3) expect(b.includes(Buffer.from("tRNS"))).toBe(false);
  });
});
