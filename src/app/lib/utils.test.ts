// The local `cn` must merge exactly like the reference (the `cn` package, tailwind-merge
// semantics; dev dependency only) for every class written in app/. Merging is decided pair
// by pair (a class is dropped when a later one overrides its group), so checking every
// ordered pair of known classes covers every call.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { cn as reference } from "cn";
import { describe, expect, test } from "vitest";
import { cn } from "./utils";

const root = join(import.meta.dirname, "..");

/**
 * Every whitespace-separated word in a string literal of app/ source (a superset of classes).
 * Server-only modules never hold class names; their SQL ("count(*) filter (where …)") is not a
 * Tailwind `filter` class, so they are left out.
 */
function sourceTokens(): string[] {
  const serverOnly = (f: string) => /(^|\/)server\//.test(f) || /\.server\.tsx?$/.test(f);
  const files = (readdirSync(root, { recursive: true }) as string[]).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !serverOnly(f));
  const tokens = new Set<string>();
  for (const file of files) {
    for (const match of readFileSync(join(root, file), "utf8").matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)) {
      for (const token of (match[1] ?? match[2] ?? match[3] ?? "").split(/\s+/)) if (token) tokens.add(token);
    }
  }
  return [...tokens];
}

/** `md:hover:px-2` → "hover|md" (top-level colons only; brackets may hold colons). */
function variantSet(token: string): string {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < token.length; i++) {
    if (token[i] === "[" || token[i] === "(") depth++;
    else if (token[i] === "]" || token[i] === ")") depth--;
    else if (token[i] === ":" && depth === 0) {
      parts.push(token.slice(start, i));
      start = i + 1;
    }
  }
  return parts.sort().join("|");
}

function byVariants(tokens: string[]): string[][] {
  const buckets = new Map<string, string[]>();
  for (const token of tokens) {
    const key = variantSet(token);
    buckets.set(key, [...(buckets.get(key) ?? []), token]);
  }
  return [...buckets.values()];
}

describe("cn", () => {
  const tokens = sourceTokens();
  // A class either implementation treats as a utility dedupes against itself.
  const known = tokens.filter((t) => reference(t, t) === t || cn(t, t) === t);

  test("joins like clsx: strings, arrays and numbers; skips falsy values and booleans", () => {
    expect(cn("a", false, null, undefined, "", true, ["b", ["c", 0, 1]], "d")).toBe("a b c 1 d");
    expect(cn("a", false, null, undefined, "", true, ["b", ["c", 0, 1]], "d")).toBe(reference("a", false, null, undefined, "", true, ["b", ["c", 0, 1]], "d"));
  });

  test("a later class overrides an earlier one in the same group", () => {
    expect(cn("px-2 py-1 border-transparent text-sm", "px-4 border-input text-lg")).toBe("py-1 px-4 border-input text-lg");
    expect(cn("p-2 md:p-4", "p-3")).toBe("md:p-4 p-3");
  });

  test("finds a known utility among the source classes (the parity check is not empty)", () => {
    expect(tokens.length).toBeGreaterThan(1000);
    expect(known.length).toBeGreaterThan(400);
  });

  test("treats every source word alone and doubled like the reference", () => {
    const mismatches = tokens.filter((t) => cn(t, t) !== reference(t, t) || cn(t) !== reference(t));
    expect(mismatches).toEqual([]);
  });

  // Classes only compete under the same variants, so pairs are formed within each variant set
  // (order-insensitive, as tailwind-merge sorts variants); this keeps the check to ~1 s.
  test("merges every ordered pair of source classes under the same variants like the reference", () => {
    const mismatches: string[] = [];
    for (const bucket of byVariants(known)) {
      for (const a of bucket) {
        for (const b of bucket) {
          const ours = cn(a, b);
          const theirs = reference(a, b);
          if (ours !== theirs) mismatches.push(`cn("${a}", "${b}") = "${ours}", expected "${theirs}"`);
        }
      }
    }
    expect(mismatches.slice(0, 40)).toEqual([]);
  }, 20_000); // ~3 s on CI; pairs grow with the classes in app/, and a loaded runner must not time it out

  test("keeps classes under different variants apart, like the reference", () => {
    const samples = byVariants(known).map((bucket) => bucket[0] as string);
    const mismatches = samples.flatMap((a) => samples.filter((b) => cn(a, b) !== reference(a, b)).map((b) => `${a} / ${b}`));
    expect(mismatches).toEqual([]);
  });
});
