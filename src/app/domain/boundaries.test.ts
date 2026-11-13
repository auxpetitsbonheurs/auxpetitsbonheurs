// S-081 AC12: the pricing rules stay pure (they run in the browser and on the Worker): no
// database, React, router, server or network imports, and no clock reads.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const PURE = ["pricing.ts", "option-prices.ts", "basket.ts", "basket-cookie.ts", "season.ts", "errors.ts"];
const source = (file: string) => readFileSync(fileURLToPath(new URL(`./${file}`, import.meta.url)), "utf8");
const imports = (code: string) => [...code.matchAll(/^import[^;]*?from\s+"([^"]+)"/gms)].map((m) => m[1]!);

describe("domain boundaries (AC12)", () => {
  test.each(PURE)("%s imports only other domain modules", (file) => {
    for (const target of imports(source(file))) expect(target, `${file} imports ${target}`).toMatch(/^\.\/[\w-]+$/);
  });

  test.each(PURE)("%s reads no clock and makes no network call", (file) => {
    const code = source(file);
    expect(code).not.toMatch(/Date\.now\(|new Date\(\)|fetch\(|XMLHttpRequest|performance\.now/);
  });
});
