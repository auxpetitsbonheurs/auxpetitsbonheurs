// S-007 AC2/AC4: app.css carries the light and dark colours of docs/design/tokens.json,
// and every pair the tokens' contrast table marks as passing really meets WCAG AA.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { contrastRatio } from "./contrast";

type Mode = "light" | "dark";
interface ColorToken {
  $extensions: { shadcn?: string; mode: Record<Mode, string> };
}
interface ContrastPair {
  fg: string;
  bg: string;
  ratio: number | string;
  pass: boolean;
}

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const tokens = JSON.parse(read("../../../docs/design/tokens.json")) as {
  color: Record<string, ColorToken | string>;
  $extensions: { contrast: Record<Mode, ContrastPair[]> };
};
const css = read("../app.css");

const roles = Object.entries(tokens.color).filter(
  (entry): entry is [string, ColorToken] => typeof entry[1] === "object" && "$extensions" in entry[1],
);

/** Custom properties declared in the first block matching `selector`. */
function declarations(selectorPattern: RegExp): Map<string, string> {
  const match = selectorPattern.exec(css);
  if (!match) throw new Error(`no block ${selectorPattern} in app.css`);
  const block = css.slice(match.index + match[0].length, css.indexOf("}", match.index + match[0].length));
  return new Map([...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim().toLowerCase()]));
}

const cssByMode: Record<Mode, Map<string, string>> = {
  light: declarations(/:root\s*\{/),
  dark: declarations(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{/),
};

/** The CSS variable for a role: its shadcn name, else `--<role>`. */
const cssVariable = (role: string, token: ColorToken) => token.$extensions.shadcn ?? `--${role}`;

describe.each(["light", "dark"] as const)("app.css %s colours match tokens.json (AC2)", (mode) => {
  test.each(roles)("%s", (role, token) => {
    expect(cssByMode[mode].get(cssVariable(role, token))).toBe(token.$extensions.mode[mode].toLowerCase());
  });
});

/** UI parts (outlines, focus ring) need 3:1; text needs 4.5:1. */
const UI_ROLES = new Set(["border-input", "ring"]);

function resolve(spec: string, mode: Mode): { role: string; hex: string } {
  const [role, ...rest] = spec.trim().split(/\s+/);
  const hex = rest.find((part) => /^#[0-9a-f]{6}$/i.test(part));
  const token = tokens.color[role!];
  if (hex) return { role: role!, hex };
  if (typeof token !== "object") throw new Error(`unknown colour role "${role}"`);
  return { role: role!, hex: token.$extensions.mode[mode] };
}

/** Expands "success / warning / danger / info" rows into one pair per role. */
function pairs(mode: Mode) {
  return tokens.$extensions.contrast[mode]
    .filter((pair) => pair.pass)
    .flatMap((pair) => pair.fg.split(" / ").map((fg) => ({ fg: resolve(fg, mode), bg: resolve(pair.bg, mode) })));
}

describe.each(["light", "dark"] as const)("%s contrast pairs meet WCAG AA (AC2, AC4)", (mode) => {
  test.each(pairs(mode).map((p) => [`${p.fg.role} ${p.fg.hex} on ${p.bg.role} ${p.bg.hex}`, p] as const))(
    "%s",
    (_name, { fg, bg }) => {
      const minimum = UI_ROLES.has(fg.role) ? 3 : 4.5;
      expect(contrastRatio(fg.hex, bg.hex)).toBeGreaterThanOrEqual(minimum);
    },
  );
});

/** Every ratio written in the table (single pairs and "a / b / c" rows) is the recomputed one, to 0.1. */
describe.each(["light", "dark"] as const)("%s contrast table ratios are the recomputed values", (mode) => {
  const rows = tokens.$extensions.contrast[mode].flatMap((pair) => {
    const fgs = pair.fg.split(" / ");
    const ratios = String(pair.ratio).split(" / ").map(Number);
    return fgs.map((fg, i) => ({ fg: resolve(fg, mode), bg: resolve(pair.bg, mode), ratio: ratios[i]! }));
  });
  test.each(rows.map((r) => [`${r.fg.role} on ${r.bg.role}: ${r.ratio}`, r] as const))("%s", (_name, { fg, bg, ratio }) => {
    expect(Math.abs(contrastRatio(fg.hex, bg.hex) - ratio)).toBeLessThan(0.1);
  });
});

describe("contrastRatio", () => {
  test("black on white is 21:1 and a colour on itself is 1:1", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#660C0C", "#660C0C")).toBeCloseTo(1, 5);
  });

  test("matches the brand guide's fg on bg value (14.6)", () => {
    expect(contrastRatio("#3B1512", "#FBF3E8")).toBeCloseTo(14.66, 1);
  });
});
