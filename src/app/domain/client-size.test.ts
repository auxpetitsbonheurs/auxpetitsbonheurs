// S-097 AC5 (NFR-001): the pricing rules the browser loads for the basket (ADR-0004) stay
// small. `domain/pricing.ts` + `promotions.ts` + `time.ts`, bundled and minified as the client
// build would, must be at most 6 kB gzipped. The route budget (170 kB) is `check:js-budget`.
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { expect, test } from "vitest";

const here = fileURLToPath(new URL(".", import.meta.url));

test("pricing + promotions + time are at most 6 kB gzipped", async () => {
  const result = await build({
    stdin: { contents: 'export * from "./pricing"; export * from "./promotions"; export * from "./time";', resolveDir: here, loader: "ts" },
    bundle: true,
    minify: true,
    format: "esm",
    platform: "browser",
    write: false,
    // Shared by every route already (counted in each route's budget), not by these rules.
    external: ["~/lib/*", "~/i18n/*"],
    logLevel: "silent",
  });
  const gzipped = gzipSync(result.outputFiles[0]!.contents).byteLength;

  expect(gzipped).toBeLessThanOrEqual(6 * 1024);
});
