// S-276 AC2, AC4: the browser stores a photo's copies beside it, best effort.
import { afterEach, describe, expect, test, vi } from "vitest";
import { uploadVariants } from "./photo-variants";

const ORIGINAL = { path: "products/a/s/p.webp", type: "image/webp" };
const variants = [480, 960].map((width) => ({ width, height: width, blob: new Blob([new Uint8Array(width)], { type: "image/webp" }) }));

type Call = { url: string; init: RequestInit };

function stubFetch(answer: (call: Call) => Response | Promise<Response>): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const call = { url, init };
      calls.push(call);
      return answer(call);
    }),
  );
  return calls;
}

const signed = Response.json({ ok: true, uploads: [480, 960].map((w) => ({ path: `products/a/s/p-${w}w.webp`, signedUrl: `https://storage.test/sign/p-${w}w.webp?token=t` })) });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("uploadVariants", () => {
  test("asks admin/uploads for the copies of the stored photo, then PUTs each to its signed URL", async () => {
    const calls = stubFetch((call) => (call.url === "/admin/uploads" ? signed.clone() : new Response(null, { status: 200 })));

    const stored = await uploadVariants("sess", "page:our_story", ORIGINAL, variants);

    expect(stored).toEqual([480, 960]);
    const form = calls[0]!.init.body as FormData;
    expect([form.get("variantOf"), form.get("scope"), form.getAll("width"), form.getAll("type"), form.getAll("size")]).toEqual([
      ORIGINAL.path,
      "page:our_story",
      ["480", "960"],
      ["image/webp", "image/webp"],
      ["480", "960"],
    ]);
    expect(calls.slice(1).map((c) => [c.url, c.init.method, (c.init.headers as Record<string, string>)["content-type"]])).toEqual([
      ["https://storage.test/sign/p-480w.webp?token=t", "PUT", "image/webp"],
      ["https://storage.test/sign/p-960w.webp?token=t", "PUT", "image/webp"],
    ]);
  });

  test("a copy Storage refuses is left out; the others count", async () => {
    stubFetch((call) => (call.url === "/admin/uploads" ? signed.clone() : new Response(null, { status: call.url.includes("960") ? 400 : 200 })));

    expect(await uploadVariants("sess", "products", ORIGINAL, variants)).toEqual([480]);
  });

  test("a refused request or a network failure stores nothing and never throws", async () => {
    stubFetch(() => Response.json({ ok: false, error: { code: "UPLOAD_REJECTED" } }, { status: 422 }));
    expect(await uploadVariants("sess", "products", ORIGINAL, variants)).toEqual([]);

    stubFetch(() => Promise.reject(new TypeError("offline")));
    expect(await uploadVariants("sess", "products", ORIGINAL, variants)).toEqual([]);
  });

  test("no copies: no request", async () => {
    const calls = stubFetch(() => new Response(null));
    expect(await uploadVariants("sess", "products", ORIGINAL, [])).toEqual([]);
    expect(calls).toEqual([]);
  });
});
