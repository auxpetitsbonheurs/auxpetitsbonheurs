// S-007 AC6: touch-size buttons are at least 44 px tall and keep a focus ring with
// at least 3:1 contrast against the page in both themes.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { contrastRatio } from "~/lib/contrast";
import { Button, buttonVariants } from "./button";

type Size = NonNullable<Parameters<typeof buttonVariants>[0]>["size"];
const SIZES: Size[] = ["default", "xs", "sm", "lg", "icon", "icon-xs", "icon-sm", "icon-lg"];

/** Tailwind spacing is 0.25rem per step: min-h-11 / size-11 = 2.75rem = 44 px. */
function minHeightPx(classes: string): number {
  const steps = [...classes.matchAll(/(?:^|\s)(?:min-h|size|h)-(\d+)(?=\s|$)/g)].map((m) => Number(m[1]));
  return Math.max(0, ...steps) * 4;
}

describe("Button touch size (AC6)", () => {
  test.each(SIZES)("size %s is at least 44 px tall", (size) => {
    expect(minHeightPx(buttonVariants({ size }))).toBeGreaterThanOrEqual(44);
  });

  test("labels wrap instead of being cut off (EN/FR length rule)", () => {
    const classes = buttonVariants({});
    expect(classes).not.toMatch(/whitespace-nowrap|truncate|text-ellipsis/);
  });

  test("renders a native button with its own accessible text", () => {
    const html = renderToStaticMarkup(<Button>Add to basket</Button>);
    expect(html).toMatch(/^<button[^>]*>Add to basket<\/button>$/);
  });
});

describe("Button focus ring (AC6)", () => {
  const css = readFileSync(fileURLToPath(new URL("../../app.css", import.meta.url)), "utf8");
  const tokens = JSON.parse(
    readFileSync(fileURLToPath(new URL("../../../../docs/design/tokens.json", import.meta.url)), "utf8"),
  ) as { color: Record<string, { $extensions: { mode: Record<"light" | "dark", string> } }> };

  test("uses the solid ring token as a 2 px outline, not a translucent ring", () => {
    const classes = buttonVariants({});
    expect(classes).not.toMatch(/ring-ring\/\d+/);
    expect(classes).not.toMatch(/outline-none/);
    expect(css).toMatch(/:focus-visible\s*\{\s*outline:\s*2px solid var\(--ring\);\s*outline-offset:\s*2px;/);
  });

  test.each(["light", "dark"] as const)("ring has at least 3:1 contrast on the %s page background", (mode) => {
    const ring = tokens.color.ring!.$extensions.mode[mode];
    const page = tokens.color.bg!.$extensions.mode[mode];
    expect(contrastRatio(ring, page)).toBeGreaterThanOrEqual(3);
  });
});
