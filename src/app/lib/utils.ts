// `cn`: joins class names (clsx-style: strings, arrays, falsy skipped) and resolves Tailwind
// conflicts so a later class wins (`cn("px-2 border-transparent", "px-4 border-input")` →
// "px-4 border-input"), like tailwind-merge. A local implementation covering only the utility
// families this app uses keeps ~10 kB gzipped of merge tables off every page (NFR-001 JS
// budget). Classes it does not know are kept as written. utils.test.ts checks every class in
// app/ against the reference merge (the `cn` package, a dev dependency) pair by pair, so a new
// utility family fails CI until it is described here.

export type ClassValue = string | number | bigint | boolean | null | undefined | ClassValue[];

function collect(value: ClassValue, out: string[]): void {
  if (Array.isArray(value)) for (const item of value) collect(item, out);
  else if (value && (typeof value === "string" || typeof value === "number" || typeof value === "bigint")) out.push(String(value));
}

const T_SIZE = /^(xs|sm|base|lg|xl|[2-9]xl|\[[\d.]+(rem|px|em)\])$/;
const LENGTH = /^(\d+(\.\d+)?|\d+\/\d+|px|auto|full|screen|dvh|svh|lvh|min|max|fit|none|xs|sm|md|lg|xl|[2-7]xl|prose|\[.+\]|\(.+\))$/;
const NUMBER = /^(\d+(\.\d+)?|\[.+\]|\(.+\))$/;
const RADIUS = /^(none|full|xs|sm|md|lg|xl|[2-4]xl|\[.+\])$/;
const SHADOW = /^(2xs|xs|sm|md|lg|xl|2xl|none|inner)$/;
const OUTLINE_STYLE = /^(solid|dashed|dotted|double|hidden|none)$/;

const KEYWORDS = new Map<string, string>();
function keywords(group: string, words: string): void {
  for (const word of words.split(" ")) KEYWORDS.set(word, group);
}
keywords("display", "block inline inline-block inline-flex inline-grid inline-table flex grid hidden contents flow-root list-item table table-cell table-row table-column table-caption table-header-group table-row-group table-footer-group table-column-group");
keywords("position", "static fixed absolute relative sticky");
keywords("sr", "sr-only not-sr-only");
keywords("decoration", "underline overline line-through no-underline");
keywords("case", "uppercase lowercase capitalize normal-case");
keywords("nums", "tabular-nums proportional-nums");
keywords("visibility", "visible invisible collapse");
keywords("grow", "grow");
keywords("shrink", "shrink");
keywords("filter-gray", "grayscale");
keywords("transform", "transform transform-none transform-gpu transform-cpu");
keywords("outline", "outline");
keywords("rounded", "rounded");
keywords("border-w", "border");
keywords("ring-w", "ring");
keywords("shadow", "shadow");
keywords("transition", "transition");

/** `group` when the value matches `pattern`, else not a known utility. */
const when =
  (pattern: RegExp, group: string) =>
  (value: string): string | undefined =>
    pattern.test(value) ? group : undefined;
const ARBITRARY = String.raw`\[.+\]|\(.+\)`;
const SPACING = new RegExp(String.raw`^(\d+(\.\d+)?|px|${ARBITRARY})$`);
const MARGIN = new RegExp(String.raw`^(\d+(\.\d+)?|px|auto|${ARBITRARY})$`);
const INSET = new RegExp(String.raw`^(\d+(\.\d+)?|\d+/\d+|px|auto|full|${ARBITRARY})$`);
const INTEGER = new RegExp(String.raw`^(\d+|${ARBITRARY})$`);
const ANY = /./;

/** [prefix, group or value test] for `prefix-value` classes; the longest prefix is tried first. */
const PREFIXES: [string, (value: string) => string | undefined][] = [
  ["text", (v) => (/^(left|center|right|justify|start|end)$/.test(v) ? "text-align" : T_SIZE.test(v) ? "font-size" : "text-color")],
  ["font", (v) => (/^(thin|extralight|light|normal|medium|semibold|bold|extrabold|black|\d+)$/.test(v) ? "font-weight" : "font-family")],
  ["leading", when(/^(none|tight|snug|normal|relaxed|loose|\d+(\.\d+)?|\[.+\])$/, "leading")],
  ["tracking", when(/^(tighter|tight|normal|wide|wider|widest|\[.+\])$/, "tracking")],
  ["decoration", (v) => (/^(\d+|auto|from-font)$/.test(v) ? "decoration-w" : /^(solid|double|dotted|dashed|wavy)$/.test(v) ? "decoration-style" : "decoration-color")],
  ["underline-offset", when(/^(\d+|auto|\[.+\])$/, "underline-offset")],
  ["whitespace", when(/^(normal|nowrap|pre|pre-line|pre-wrap|break-spaces)$/, "whitespace")],
  ["wrap", when(/^(break-word|anywhere|normal)$/, "wrap")],
  ["hyphens", when(/^(none|manual|auto)$/, "hyphens")],
  ["bg-clip", when(/^(border|padding|content|text)$/, "bg-clip")],
  ["bg", when(ANY, "bg-color")],
  ["from", when(ANY, "gradient-from")],
  ["border", (v) => {
    if (v === "collapse" || v === "separate") return "border-collapse";
    if (OUTLINE_STYLE.test(v)) return "border-style";
    const side = /^([xytrblse])(-(.+))?$/.exec(v);
    if (side && (side[3] === undefined || NUMBER.test(side[3]))) return `border-w-${side[1]}`;
    return NUMBER.test(v) ? "border-w" : "border-color";
  }],
  ["divide", (v) => (/^[xy](-\d+)?$/.test(v) ? `divide-${v[0]}` : "divide-color")],
  ["rounded", (v) => {
    const side = /^(t|r|b|l|s|e|tl|tr|br|bl|ss|se|es|ee)(-(.+))?$/.exec(v);
    if (side) return side[3] === undefined || RADIUS.test(side[3]) ? `rounded-${side[1]}` : undefined;
    return RADIUS.test(v) ? "rounded" : undefined;
  }],
  ["shadow", (v) => (SHADOW.test(v) ? "shadow" : "shadow-color")],
  ["border-spacing", when(SPACING, "border-spacing")],
  ["ring-offset", (v) => (NUMBER.test(v) ? "ring-offset-w" : "ring-offset-color")],
  ["ring", (v) => (NUMBER.test(v) ? "ring-w" : "ring-color")],
  ["outline-offset", when(NUMBER, "outline-offset")],
  ["outline", (v) => (NUMBER.test(v) ? "outline-w" : OUTLINE_STYLE.test(v) ? "outline-style" : "outline-color")],
  ["opacity", when(NUMBER, "opacity")],
  ["accent", when(ANY, "accent")],
  ["cursor", when(/^[a-z-]+$|^\[.+\]$/, "cursor")],
  ["pointer-events", when(/^(auto|none)$/, "pointer-events")],
  ["select", when(/^(none|text|all|auto)$/, "select")],
  ["appearance", when(/^(none|auto)$/, "appearance")],
  ["overflow-x", when(/^(auto|hidden|clip|visible|scroll)$/, "overflow-x")],
  ["overflow-y", when(/^(auto|hidden|clip|visible|scroll)$/, "overflow-y")],
  ["overflow", when(/^(auto|hidden|clip|visible|scroll)$/, "overflow")],
  ["object", when(/^(contain|cover|fill|none|scale-down)$/, "object-fit")],
  ["aspect", when(/^(auto|square|video|\d+\/\d+|\[.+\])$/, "aspect")],
  ["transition", when(/^(all|colors|opacity|shadow|transform|none)$/, "transition")],
  ["duration", when(NUMBER, "duration")],
  ["ease", when(/^(linear|in|out|in-out|initial|\[.+\]|\(.+\))$/, "ease")],
  ["animate", when(/^(spin|ping|pulse|bounce|none|\[.+\])$/, "animate")],
  ["origin", when(/^(center|top|top-right|right|bottom-right|bottom|bottom-left|left|top-left|\[.+\])$/, "origin")],
  ["translate-x", when(INSET, "translate-x")],
  ["list", when(/^(none|disc|decimal|\[.+\])$/, "list-type")],
  ["align", when(/^(baseline|top|middle|bottom|text-top|text-bottom|sub|super)$/, "align")],
  ["content", when(/^(none|\[.+\]|\(.+\))$/, "content")],
  ["table", when(/^(auto|fixed)$/, "table-layout")],
  ["z", when(/^(\d+|auto|\[.+\])$/, "z")],
  ["order", when(/^(\d+|first|last|none|\[.+\])$/, "order")],
  ["basis", when(INSET, "basis")],
  ["flex", (v) => (/^(row|row-reverse|col|col-reverse)$/.test(v) ? "flex-direction" : /^(wrap|wrap-reverse|nowrap)$/.test(v) ? "flex-wrap" : /^(\d+|auto|initial|none|\[.+\])$/.test(v) ? "flex" : undefined)],
  ["grow", when(INTEGER, "grow")],
  ["shrink", when(INTEGER, "shrink")],
  ["grid-cols", when(/^(\d+|none|subgrid|\[.+\])$/, "grid-cols")],
  ["col-span", when(/^(\d+|full)$/, "col-span")],
  ["justify-items", when(/^(start|end|center|stretch|normal)$/, "justify-items")],
  ["justify-self", when(/^(auto|start|end|center|stretch)$/, "justify-self")],
  ["justify", when(/^(start|end|center|between|around|evenly|stretch|baseline|normal)$/, "justify-content")],
  ["items", when(/^(start|end|center|baseline|stretch)$/, "align-items")],
  ["self", when(/^(auto|start|end|center|stretch|baseline)$/, "align-self")],
  ...["gap-x", "gap-y", "gap", "space-x", "space-y", "scroll-m", "scroll-mt", "scroll-mb"].map((p) => [p, when(SPACING, p)] as [string, (value: string) => string | undefined]),
  ...["inset-x", "inset-y", "inset", "top", "right", "bottom", "left", "start", "end"].map((p) => [p, when(INSET, p)] as [string, (value: string) => string | undefined]),
  ["size", when(LENGTH, "size")],
  ["min-w", when(LENGTH, "min-w")],
  ["min-h", when(LENGTH, "min-h")],
  ["max-w", when(LENGTH, "max-w")],
  ["max-h", when(LENGTH, "max-h")],
  ["w", when(LENGTH, "w")],
  ["h", when(LENGTH, "h")],
  ...["p", "px", "py", "ps", "pe", "pt", "pr", "pb", "pl"].map((p) => [p, when(SPACING, p)] as [string, (value: string) => string | undefined]),
  ...["m", "mx", "my", "ms", "me", "mt", "mr", "mb", "ml"].map((p) => [p, when(MARGIN, p)] as [string, (value: string) => string | undefined]),
];
PREFIXES.sort((a, b) => b[0].length - a[0].length);

/** Groups a later class also overrides (`p-4` after `px-2` replaces it; not the reverse). */
const CONFLICTS: Record<string, string[]> = {
  "font-size": ["leading"],
  inset: ["inset-x", "inset-y", "start", "end", "top", "right", "bottom", "left"],
  "inset-x": ["right", "left", "start", "end"],
  "inset-y": ["top", "bottom"],
  size: ["w", "h"],
  gap: ["gap-x", "gap-y"],
  overflow: ["overflow-x", "overflow-y"],
  p: ["px", "py", "ps", "pe", "pt", "pr", "pb", "pl"],
  px: ["pr", "pl", "ps", "pe"],
  py: ["pt", "pb"],
  m: ["mx", "my", "ms", "me", "mt", "mr", "mb", "ml"],
  mx: ["mr", "ml", "ms", "me"],
  my: ["mt", "mb"],
  "scroll-m": ["scroll-mt", "scroll-mb"],
  rounded: ["rounded-s", "rounded-e", "rounded-t", "rounded-r", "rounded-b", "rounded-l", "rounded-ss", "rounded-se", "rounded-ee", "rounded-es", "rounded-tl", "rounded-tr", "rounded-br", "rounded-bl"],
  "rounded-t": ["rounded-tl", "rounded-tr"],
  "rounded-b": ["rounded-br", "rounded-bl"],
  "rounded-l": ["rounded-tl", "rounded-bl"],
  "rounded-r": ["rounded-tr", "rounded-br"],
  "rounded-s": ["rounded-ss", "rounded-es"],
  "rounded-e": ["rounded-se", "rounded-ee"],
  "border-w": ["border-w-x", "border-w-y", "border-w-s", "border-w-e", "border-w-t", "border-w-r", "border-w-b", "border-w-l"],
  "border-w-x": ["border-w-r", "border-w-l"],
  "border-w-y": ["border-w-t", "border-w-b"],
  flex: ["basis", "grow", "shrink"],
};

/** The conflict group of a class without variants, or undefined when it is not a known utility. */
function groupOf(utility: string): string | undefined {
  if (/^\[[a-z-]+:.+\]$/.test(utility)) return utility.slice(0, utility.indexOf(":"));
  const base = utility.replace(/^-/, "");
  const keyword = KEYWORDS.get(base);
  if (keyword) return keyword;
  for (const [prefix, group] of PREFIXES) {
    if (!base.startsWith(`${prefix}-`)) continue;
    const value = base.slice(prefix.length + 1);
    if (!value) return undefined;
    return group(value);
  }
  return undefined;
}

/** Splits `md:hover:!px-2` into its variants (`md:hover:`), important flag and utility. */
function parse(token: string): { variants: string; utility: string } {
  let depth = 0;
  let cut = 0;
  for (let i = 0; i < token.length; i++) {
    const char = token[i];
    if (char === "[" || char === "(") depth++;
    else if (char === "]" || char === ")") depth--;
    else if (char === ":" && depth === 0) cut = i + 1;
  }
  let utility = token.slice(cut);
  let variants = token.slice(0, cut);
  if (utility.startsWith("!") || utility.endsWith("!")) {
    utility = utility.replace(/^!|!$/g, "");
    variants += "!";
  }
  return { variants, utility };
}

export function cn(...inputs: ClassValue[]): string {
  const tokens: string[] = [];
  collect(inputs, tokens);
  const classes = tokens.join(" ").split(/\s+/).filter(Boolean);
  const taken = new Set<string>();
  const kept: string[] = [];
  for (let i = classes.length - 1; i >= 0; i--) {
    const token = classes[i] as string;
    const { variants, utility } = parse(token);
    const group = groupOf(utility);
    if (group === undefined) {
      kept.push(token);
      continue;
    }
    if (taken.has(variants + group)) continue;
    kept.push(token);
    taken.add(variants + group);
    for (const other of CONFLICTS[group] ?? []) taken.add(variants + other);
  }
  return kept.reverse().join(" ");
}
