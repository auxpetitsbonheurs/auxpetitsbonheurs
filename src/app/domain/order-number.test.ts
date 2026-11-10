import { describe, expect, test } from "vitest";
import { formatOrderNumber, newTrackingToken } from "./order-number";

describe("formatOrderNumber (S-013 AC5)", () => {
  test("is the Settings prefix plus at least 4 digits", () => {
    expect(formatOrderNumber("APB-", 1)).toBe("APB-0001");
    expect(formatOrderNumber("APB-", 42)).toBe("APB-0042");
    expect(formatOrderNumber("APB-", 12345)).toBe("APB-12345");
  });
});

describe("newTrackingToken (S-013 AC5)", () => {
  test("is 43 base64url characters from 32 random bytes", () => {
    const token = newTrackingToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const bytes = Buffer.from(token, "base64url");
    expect(bytes).toHaveLength(32);
  });

  test("is random: never repeats and is unrelated to any order number", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => newTrackingToken()));

    expect(tokens.size).toBe(200);
  });

  test("uses the given random source (32 bytes requested)", () => {
    const requested: number[] = [];
    const token = newTrackingToken((bytes) => {
      requested.push(bytes.length);
      bytes.fill(255);
      return bytes;
    });

    expect(requested).toEqual([32]);
    expect(token).toBe("_".repeat(42) + "8");
  });
});
