import { describe, expect, test, vi } from "vitest";
import { supabaseStorage } from "./storage.server";

describe("supabaseStorage.signRead (E-08 S-155 AC2)", () => {
  test("asks Storage for a read URL valid the given seconds and returns it absolute", async () => {
    const fetch = vi.fn(async () => Response.json({ signedURL: "/object/sign/request-photos/requests/s/p.webp?token=read123" }));
    const storage = supabaseStorage({ url: "https://ref.supabase.co", serviceRoleKey: "service-key", fetch });

    const url = await storage.signRead("request-photos", "requests/s/p.webp", 600);

    expect(url).toBe("https://ref.supabase.co/storage/v1/object/sign/request-photos/requests/s/p.webp?token=read123");
    const [called, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(called).toBe("https://ref.supabase.co/storage/v1/object/sign/request-photos/requests/s/p.webp");
    expect(JSON.parse(init.body as string)).toEqual({ expiresIn: 600 });
    expect(init.headers).toMatchObject({ authorization: "Bearer service-key" });
  });

  test("throws without the key when Storage refuses or answers no token", async () => {
    const refused = supabaseStorage({ url: "https://ref.supabase.co", serviceRoleKey: "service-key", fetch: async () => new Response("no", { status: 400 }) });
    await expect(refused.signRead("request-photos", "x", 600)).rejects.toThrow("storage sign read answered 400");
    const tokenless = supabaseStorage({ url: "https://ref.supabase.co", serviceRoleKey: "service-key", fetch: async () => Response.json({ signedURL: "/x" }) });
    await expect(tokenless.signRead("request-photos", "x", 600)).rejects.toThrow("without a token");
  });
});

describe("supabaseStorage.remove", () => {
  test("DELETEs the paths from the bucket with the service key", async () => {
    const fetch = vi.fn(async () => new Response("[]", { status: 200 }));
    const storage = supabaseStorage({ url: "https://ref.supabase.co/", serviceRoleKey: "service-key", fetch });

    await storage.remove("public-images", ["products/a/1.webp", "products/a/2.webp"]);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://ref.supabase.co/storage/v1/object/public-images");
    expect(init.method).toBe("DELETE");
    expect(init.headers).toMatchObject({ authorization: "Bearer service-key", apikey: "service-key" });
    expect(JSON.parse(init.body as string)).toEqual({ prefixes: ["products/a/1.webp", "products/a/2.webp"] });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  test("throws when Storage refuses, without the key in the message", async () => {
    const storage = supabaseStorage({ url: "https://ref.supabase.co", serviceRoleKey: "service-key", fetch: async () => new Response("no", { status: 500 }) });

    const error = await storage.remove("public-images", ["x"]).catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("storage remove answered 500");
  });

  test("nothing to remove: no request", async () => {
    const fetch = vi.fn();
    await supabaseStorage({ url: "https://ref.supabase.co", serviceRoleKey: "k", fetch }).remove("public-images", []);

    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("supabaseStorage.signUpload (S-047 AC11)", () => {
  test("asks Storage to sign one path with the service key and returns the absolute URL and token", async () => {
    const fetch = vi.fn(async () => Response.json({ url: "/object/upload/sign/public-images/products/a/b/c.webp?token=tok123" }));
    const storage = supabaseStorage({ url: "https://ref.supabase.co", serviceRoleKey: "service-key", fetch });

    const signed = await storage.signUpload("public-images", "products/a/b/c.webp");

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://ref.supabase.co/storage/v1/object/upload/sign/public-images/products/a/b/c.webp");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ authorization: "Bearer service-key" });
    expect(signed).toEqual({ path: "products/a/b/c.webp", signedUrl: "https://ref.supabase.co/storage/v1/object/upload/sign/public-images/products/a/b/c.webp?token=tok123", token: "tok123" });
  });

  test("throws without the key when Storage refuses or answers no token", async () => {
    const refused = supabaseStorage({ url: "https://ref.supabase.co", serviceRoleKey: "service-key", fetch: async () => new Response("no", { status: 403 }) });
    const empty = supabaseStorage({ url: "https://ref.supabase.co", serviceRoleKey: "service-key", fetch: async () => Response.json({}) });

    await expect(refused.signUpload("public-images", "p.webp")).rejects.toThrow("storage sign answered 403");
    const error = await empty.signUpload("public-images", "p.webp").catch((e: Error) => e);
    expect((error as Error).message).not.toContain("service-key");
  });
});

describe("supabaseStorage.inspect (S-047 AC3)", () => {
  test("reads the first bytes with a range request and the total size from Content-Range", async () => {
    const head = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 0, 0, 0, 0]);
    const fetch = vi.fn(async () => new Response(head, { status: 206, headers: { "content-range": "bytes 0-15/204800", "content-type": "image/webp" } }));
    const storage = supabaseStorage({ url: "https://ref.supabase.co", serviceRoleKey: "k", fetch });

    const object = await storage.inspect("public-images", "products/a/b/c.webp");

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://ref.supabase.co/storage/v1/object/authenticated/public-images/products/a/b/c.webp");
    expect(init.headers).toMatchObject({ range: "bytes=0-15" });
    expect(object).toEqual({ size: 204_800, contentType: "image/webp", head });
  });

  test("a server that ignores the range: size from Content-Length, only 16 bytes kept", async () => {
    const body = new Uint8Array(5000).fill(7);
    const storage = supabaseStorage({ url: "https://ref.supabase.co", serviceRoleKey: "k", fetch: async () => new Response(body, { status: 200, headers: { "content-length": "5000", "content-type": "image/jpeg; charset=binary" } }) });

    const object = await storage.inspect("public-images", "x.jpg");

    expect(object?.size).toBe(5000);
    expect(object?.contentType).toBe("image/jpeg");
    expect(object?.head).toHaveLength(16);
  });

  test("nothing stored at the path: null (404, or Supabase's 400 Object not found)", async () => {
    for (const status of [404, 400]) {
      const storage = supabaseStorage({ url: "https://ref.supabase.co", serviceRoleKey: "k", fetch: async () => new Response("{}", { status }) });
      expect(await storage.inspect("public-images", "missing.webp")).toBeNull();
    }
  });

  test("any other failure throws", async () => {
    const storage = supabaseStorage({ url: "https://ref.supabase.co", serviceRoleKey: "k", fetch: async () => new Response("down", { status: 503 }) });

    await expect(storage.inspect("public-images", "x.webp")).rejects.toThrow("storage inspect answered 503");
  });
});
