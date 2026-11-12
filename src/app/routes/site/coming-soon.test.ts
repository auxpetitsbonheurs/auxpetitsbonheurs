// E-13 placeholder pages (S-242 Notes): every nav page answers 200 with a calm page until its story ships.
import { describe, expect, test } from "vitest";
import { loader, meta } from "./coming-soon";

const load = (path: string) => loader({ url: new URL(path, "http://localhost") } as never);

describe("coming-soon pages", () => {
  test.each([
    ["/our-story", "ourStory", "Our story"],
    ["/custom-cake", "customOrder", "Custom order"],
    ["/workshops", "workshops", "Workshops"],
    ["/gallery", "gallery", "Gallery"],
    ["/contact", "contact", "Contact us"],
    ["/fr/custom-cake", "customOrder", "Gâteau sur mesure"],
  ])("%s answers its page and localised title", (path, page, title) => {
    expect(load(path)).toEqual({ page, title });
  });

  test("they are noindex while placeholders", () => {
    expect(meta({ loaderData: { page: "gallery", title: "Gallery" } } as never)).toContainEqual({ name: "robots", content: "noindex" });
  });

  test("a path that is not a placeholder page is a 404", () => {
    let status: number | undefined;
    try {
      load("/menu");
    } catch (error) {
      status = (error as { init?: { status?: number } }).init?.status;
    }
    expect(status).toBe(404);
  });
});
