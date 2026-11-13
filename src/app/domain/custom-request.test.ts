// E-08 pure rules: quote expiry (S-158 AC4, S-160 AC5/AC8), default expiry (S-156 AC1/AC2),
// request photo paths (S-153 AC4).
import { describe, expect, test } from "vitest";
import { canRespondToQuote, defaultQuoteExpiry, isOccasion, isQuoteExpired, isRequestPhotoPath, requestPhotoPrefix } from "./custom-request";
import { todayMU } from "./time";

const SESSION = "0b6a6c1e-4a4f-4d0e-9f53-2a1b3c4d5e6f";
const OTHER = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const FILE = "1f0e2d3c-4b5a-4968-8776-a5b4c3d2e1f0";

describe("quote expiry (Mauritius calendar date)", () => {
  test("S-156 AC1: default expiry on 2026-11-10 with 5 days is 2026-11-15", () => {
    expect(defaultQuoteExpiry("2026-11-10", 5)).toBe("2026-11-15");
  });

  test("S-156 AC2: validity 3 days gives today + 3", () => {
    expect(defaultQuoteExpiry("2026-11-30", 3)).toBe("2026-12-03");
  });

  test("S-158 AC4: valid through 23:59:59 MU on the expiry day (19:59:59 UTC)", () => {
    const lastSecond = todayMU(new Date("2026-11-15T19:59:59Z"));
    expect(isQuoteExpired("2026-11-15", lastSecond)).toBe(false);
    expect(canRespondToQuote("quote_sent", "2026-11-15", lastSecond)).toBe(true);
  });

  test("S-158 AC3, S-160 AC5: the next Mauritius day it is expired (00:00 MU = 20:00 UTC)", () => {
    const nextDay = todayMU(new Date("2026-11-15T20:00:00Z"));
    expect(isQuoteExpired("2026-11-15", nextDay)).toBe(true);
    expect(canRespondToQuote("quote_sent", "2026-11-15", nextDay)).toBe(false);
  });

  test("only Quote sent can be answered", () => {
    for (const status of ["quote_needed", "approved", "closed", "cancelled", "declined"] as const) {
      expect(canRespondToQuote(status, "2026-12-01", "2026-11-20")).toBe(false);
    }
    expect(canRespondToQuote("quote_sent", null, "2026-11-20")).toBe(false);
  });
});

describe("request photo paths (S-153 AC4)", () => {
  test("a path issued for this session is accepted", () => {
    expect(isRequestPhotoPath(`${requestPhotoPrefix(SESSION)}${FILE}.webp`, SESSION)).toBe(true);
    expect(isRequestPhotoPath(`requests/${SESSION}/${FILE}.jpg`, SESSION.toUpperCase())).toBe(true);
  });

  test("another session, another folder, a traversal or another type is refused", () => {
    expect(isRequestPhotoPath(`requests/${OTHER}/${FILE}.webp`, SESSION)).toBe(false);
    expect(isRequestPhotoPath(`products/${SESSION}/${FILE}.webp`, SESSION)).toBe(false);
    expect(isRequestPhotoPath(`requests/${SESSION}/../${OTHER}/${FILE}.webp`, SESSION)).toBe(false);
    expect(isRequestPhotoPath(`requests/${SESSION}/${FILE}.pdf`, SESSION)).toBe(false);
  });
});

test("occasions are a fixed list of keys", () => {
  expect(isOccasion("birthday")).toBe(true);
  expect(isOccasion("<script>")).toBe(false);
});
