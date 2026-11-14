// The Owner's official logo badges (2026-11-14), cut to transparent circles from her two
// raster badges by docs/design/brand/cut_badges.py (1024 px masters beside it). Which goes where,
// by contrast: the CREAM badge (cream disc, burgundy script) on the burgundy bands (header,
// footer, hero placeholder) and on white invoice paper; the BURGUNDY badge (burgundy disc,
// cream script) on cream and light surfaces (admin shell, page-change loader, emails, icons).

export type BadgeColour = "cream" | "burgundy";

/** Widths exported per colour (public/brand/badge-<colour>-<w>.webp). */
const BADGE_WIDTHS: Record<BadgeColour, readonly number[]> = {
  cream: [64, 128, 192, 256, 320],
  burgundy: [64, 128, 192],
};

export const badgePath = (colour: BadgeColour, width: number) => `/brand/badge-${colour}-${width}.webp`;

/**
 * `src` and `srcSet` (w descriptors) for a badge shown at `maxCssPx` at most: every exported
 * width up to 3x that size, so phones get sharp files and nothing much larger than needed.
 */
export function badgeImage(colour: BadgeColour, maxCssPx: number): { src: string; srcSet: string } {
  const all = BADGE_WIDTHS[colour];
  const fitting = all.filter((w) => w <= maxCssPx * 3);
  const widths = fitting.length > 0 ? fitting : all.slice(0, 1);
  const src = badgePath(colour, widths.find((w) => w >= maxCssPx) ?? widths.at(-1)!);
  return { src, srcSet: widths.map((w) => `${badgePath(colour, w)} ${w}w`).join(", ") };
}

/** PNG for email clients (no WebP everywhere): burgundy badge, 240 px for 120 px displayed. */
export const EMAIL_BADGE = { path: "/brand/badge-burgundy-240.png", displayPx: 120 } as const;

/** PNG embedded in the invoice PDF (pdf-lib `embedPng`): cream badge, 300 px. */
export const INVOICE_BADGE_PATH = "/brand/badge-cream-300.png";
