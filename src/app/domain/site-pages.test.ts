// E-13 S-245..S-249 page rules: issued photo paths per page and session.
import { describe, expect, test } from "vitest";
import { PAGE_PHOTO_LIMITS, isIssuedPagePhotoPath, isPagePhotoPath, isSitePageKey, pagePhotoPrefix } from "./site-pages";

const ADMIN = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";
const FILE = "33333333-3333-4333-8333-333333333333.webp";

describe("page photo paths (S-247 AC6)", () => {
  test("a path issued for this page, admin and session is accepted; any other is not", () => {
    const path = `${pagePhotoPrefix("our_story", ADMIN, SESSION)}${FILE}`;

    expect(path).toBe(`site/pages/our_story/${ADMIN}/${SESSION}/${FILE}`);
    expect(isIssuedPagePhotoPath(path, "our_story", ADMIN, SESSION)).toBe(true);
    expect(isIssuedPagePhotoPath(path, "workshops", ADMIN, SESSION)).toBe(false);
    expect(isIssuedPagePhotoPath(path, "our_story", ADMIN, ADMIN)).toBe(false);
    expect(isIssuedPagePhotoPath(`${path}/../x.webp`, "our_story", ADMIN, SESSION)).toBe(false);
    expect(isIssuedPagePhotoPath(`site/${ADMIN}/${SESSION}/${FILE}`, "our_story", ADMIN, SESSION)).toBe(false);
  });

  test("a stored path belongs to its page only", () => {
    expect(isPagePhotoPath(`site/pages/workshops/${ADMIN}/${SESSION}/${FILE}`, "workshops")).toBe(true);
    expect(isPagePhotoPath(`site/pages/workshops/${ADMIN}/${SESSION}/${FILE}`, "our_story")).toBe(false);
  });

  test("limits: our_story 4, workshops 6, custom_order 3, gallery and contact none", () => {
    expect(PAGE_PHOTO_LIMITS).toEqual({ our_story: 4, workshops: 6, gallery: 0, contact: 0, custom_order: 3 });
    expect(isSitePageKey("our_story")).toBe(true);
    expect(isSitePageKey("home")).toBe(false);
  });
});
