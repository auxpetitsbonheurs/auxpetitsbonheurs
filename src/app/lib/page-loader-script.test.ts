// S-317 AC5: the full-page-load loader script is written before </body> of customer pages,
// carries the CSP nonce, survives a </body> cut across chunks, and stays small.
import { gzipSync } from "node:zlib";
import { describe, expect, test } from "vitest";
import { PAGE_LOADER_SCRIPT, createPageLoaderScriptTransform, isCustomerPage } from "./page-loader-script";

async function run(chunks: string[], nonce?: string): Promise<string> {
  const encoder = new TextEncoder();
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(source.pipeThrough(createPageLoaderScriptTransform(nonce))).text();
}

describe("createPageLoaderScriptTransform", () => {
  test("writes the script with the nonce just before </body>, once", async () => {
    const html = await run(["<html><body><main>Menu</main></body></html>"], "abc123==");

    expect(html).toBe(`<html><body><main>Menu</main><script nonce="abc123==">${PAGE_LOADER_SCRIPT}</script></body></html>`);
  });

  test("finds </body> cut between chunks, and keeps every byte (accents too)", async () => {
    const html = await run(["<body>Crème brûlée</bo", "dy></html>"], "n0nce");

    expect(html).toBe(`<body>Crème brûlée<script nonce="n0nce">${PAGE_LOADER_SCRIPT}</script></body></html>`);
  });

  test("never writes a nonce that is not base64 (no markup injection)", async () => {
    const html = await run(["<body></body>"], '"><img src=x>');

    expect(html).toContain(`<script>${PAGE_LOADER_SCRIPT}</script></body>`);
    expect(html).not.toContain("<img");
  });

  test("a document without </body> passes through unchanged", async () => {
    expect(await run(["<p>part", "ial</p>"])).toBe("<p>partial</p>");
  });
});

describe("PAGE_LOADER_SCRIPT", () => {
  test("is tiny: under 1 kB gzipped", () => {
    expect(gzipSync(PAGE_LOADER_SCRIPT).byteLength).toBeLessThan(1024);
  });

  test("is valid script and does nothing on a page without the overlay", () => {
    expect(() => new Function("document", "location", "addEventListener", PAGE_LOADER_SCRIPT)({ getElementById: () => null }, {}, () => undefined)).not.toThrow();
  });
});

describe("isCustomerPage", () => {
  test("customer frame pages only: not admin, not resource routes", () => {
    expect(isCustomerPage(["root", "site-en", "menu-en"])).toBe(true);
    expect(isCustomerPage(["root", "site-fr", "basket-fr"])).toBe(true);
    expect(isCustomerPage(["root", "admin", "admin-today"])).toBe(false);
    expect(isCustomerPage(["root"])).toBe(false);
  });
});
