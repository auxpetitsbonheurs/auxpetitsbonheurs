import { describe, expect, test, vi } from "vitest";
import { supabaseStorage } from "./storage.server";

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
