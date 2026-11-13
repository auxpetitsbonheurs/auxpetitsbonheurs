// S-254 (NFR-001): hashed build assets are cached for a year by browsers; named brand files
// for a day. Cloudflare's asset server applies public/_headers before the Worker runs.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const rules = readFileSync(new URL("../public/_headers", import.meta.url), "utf8");

/** The header lines under `path` in the _headers file. */
function headersFor(path: string): string[] {
  const lines = rules.split("\n").filter((line) => !line.startsWith("#"));
  const start = lines.indexOf(path);
  if (start === -1) return [];
  const block: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith("  ")) break;
    block.push(line.trim());
  }
  return block;
}

describe("static asset caching (public/_headers)", () => {
  test("hashed /assets/* files are immutable for a year", () => {
    expect(headersFor("/assets/*")).toEqual(["Cache-Control: public, max-age=31536000, immutable"]);
  });

  test("brand files and favicons are cached for a day, never immutable", () => {
    for (const path of ["/brand/*", "/favicon.*"]) {
      const [cache] = headersFor(path);
      expect(cache).toMatch(/^Cache-Control: public, max-age=86400/);
      expect(cache).not.toContain("immutable");
    }
  });
});
