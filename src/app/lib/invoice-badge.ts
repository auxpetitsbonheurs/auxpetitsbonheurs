// The pink brand badge for invoices (S-127): public/brand/logo-badge-pink.svg (the v0.3 badge
// recoloured: soft pink disc, charcoal line art) read as simple shapes, so the PDF draws it as
// vectors (sharp at any zoom, no image to load). Handles exactly what the badge file uses:
// circles, paths and one level of <g> carrying stroke attributes.

export interface BadgePaint {
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  strokeOpacity: number;
  lineCap: "butt" | "round";
}

export type BadgeShape = ({ kind: "circle"; cx: number; cy: number; r: number } | { kind: "path"; d: string }) & BadgePaint;

export const BADGE_VIEWBOX = 240;

/** Attribute names camel-cased (stroke-width → strokeWidth), as the DOM names them. */
const camel = (name: string) => name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());

const attributes = (source: string): Record<string, string> =>
  Object.fromEntries([...source.matchAll(/([a-z-]+)="([^"]*)"/g)].map((m) => [camel(m[1] ?? ""), m[2] ?? ""]));

const color = (value: string | undefined): string | null => (value && value !== "none" ? value : null);

/** Every filled shape of the badge names its fill; the one without (the rules beside the tagline) is lines only. */
function paint(own: Record<string, string>, group: Record<string, string>): BadgePaint {
  const merged = { ...group, ...own };
  return {
    fill: color(merged.fill),
    stroke: color(merged.stroke),
    strokeWidth: Number(merged.strokeWidth ?? 1),
    strokeOpacity: Number(merged.strokeOpacity ?? 1),
    lineCap: merged.strokeLinecap === "round" ? "round" : "butt",
  };
}

/** The badge's shapes in drawing order. */
export function badgeShapes(svg: string): BadgeShape[] {
  const shapes: BadgeShape[] = [];
  let group: Record<string, string> = {};
  for (const match of svg.matchAll(/<(\/?)(g|circle|path)\b([^>]*?)\/?>/g)) {
    const [, closing, tag, rest = ""] = match;
    if (tag === "g") {
      group = closing ? {} : attributes(rest);
      continue;
    }
    const own = attributes(rest);
    if (tag === "circle") shapes.push({ kind: "circle", cx: Number(own.cx), cy: Number(own.cy), r: Number(own.r), ...paint(own, group) });
    else if (own.d) shapes.push({ kind: "path", d: own.d, ...paint(own, group) });
  }
  return shapes;
}
