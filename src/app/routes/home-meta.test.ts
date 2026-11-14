// S-224 AC1, AC6: the home page's share image is its hero photo only when link previews can show it.
import type { MetaDescriptor } from "react-router";
import { describe, expect, test } from "vitest";
import { meta } from "./home";

const ORIGIN = "https://bakery.example";
const ogImage = (photo: { url: string; srcSet?: string } | null) => {
  const loaderData = { title: "Homemade cakes in Mauritius", description: "Homemade cakes, cupcakes and desserts baked to order in Mauritius.", home: { hero: { photo } } };
  const tags = meta({ loaderData, matches: [{ id: "root", loaderData: { origin: ORIGIN } }], location: { pathname: "/" } } as never) as MetaDescriptor[];
  return (tags.find((t) => (t as Record<string, string>).property === "og:image") as { content?: string } | undefined)?.content;
};

describe("home share image (S-224)", () => {
  test("an SVG hero (sample data) shares the brand image instead", () => {
    expect(ogImage({ url: "/images/sample/chocolate-cake.svg" })).toBe(`${ORIGIN}/brand/og-image.png`);
  });

  test("a hero photo shares its widest copy up to 1200 px", () => {
    const url = "https://x.supabase.co/storage/v1/object/public/public-images/hero/a.webp";
    expect(ogImage({ url, srcSet: `${url.replace(".webp", "-480w.webp")} 480w, ${url.replace(".webp", "-960w.webp")} 960w, ${url} 1600w` })).toBe(url.replace(".webp", "-960w.webp"));
  });

  test("no hero photo shares the brand image", () => {
    expect(ogImage(null)).toBe(`${ORIGIN}/brand/og-image.png`);
  });
});
