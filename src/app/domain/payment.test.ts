// Juice payment rules (docs/specs/features/juice-payment.md; S-278, S-279, S-280).
import { describe, expect, test } from "vitest";
import {
  PAYMENT_DEADLINE_MS,
  PAYMENT_REMINDER_AFTER_MS,
  paymentDeadline,
  paymentDetails,
  paymentDue,
  paymentDetailsMissing,
  proofHref,
  timeLeft,
} from "./payment";

const placed = new Date("2026-11-13T08:00:00Z");
const hours = (n: number) => new Date(placed.getTime() + n * 3_600_000);

describe("deadlines (S-280)", () => {
  test("the reminder is due after 12 hours and the order is cancelled after 24", () => {
    expect(PAYMENT_REMINDER_AFTER_MS).toBe(12 * 3_600_000);
    expect(PAYMENT_DEADLINE_MS).toBe(24 * 3_600_000);
    expect(paymentDeadline(placed).toISOString()).toBe("2026-11-14T08:00:00.000Z");
  });

  test.each([
    [0, "none"],
    [11.99, "none"],
    [12, "remind"],
    [23.99, "remind"],
    [24, "cancel"],
    [100, "cancel"],
  ] as const)("%s h after placing: %s", (after, due) => {
    expect(paymentDue(placed, hours(after))).toBe(due);
  });
});

describe("time left badge (S-279 AC1)", () => {
  test("whole hours while at least one hour is left, rounded down", () => {
    expect(timeLeft(placed, hours(0))).toEqual({ kind: "hours", value: 24 });
    expect(timeLeft(placed, hours(11.5))).toEqual({ kind: "hours", value: 12 });
    expect(timeLeft(placed, hours(23))).toEqual({ kind: "hours", value: 1 });
  });

  test("minutes in the last hour, never 0", () => {
    expect(timeLeft(placed, hours(23.25))).toEqual({ kind: "minutes", value: 45 });
    expect(timeLeft(placed, new Date(placed.getTime() + PAYMENT_DEADLINE_MS - 10_000))).toEqual({ kind: "minutes", value: 1 });
  });

  test("overdue once the deadline passed (the hourly job has not run yet)", () => {
    expect(timeLeft(placed, hours(24))).toEqual({ kind: "overdue" });
  });
});

describe("payment details (S-277, S-278 AC4)", () => {
  test("both the Juice name and number are needed; values are trimmed", () => {
    expect(paymentDetails({ juiceName: " A. Baker ", juiceNumber: " 5xxx xxxx " })).toEqual({ juiceName: "A. Baker", juiceNumber: "5xxx xxxx" });
    expect(paymentDetails({ juiceName: "A. Baker", juiceNumber: "  " })).toBeNull();
    expect(paymentDetails({ juiceName: null, juiceNumber: "5xxx xxxx" })).toBeNull();
  });

  test("the Owner is warned when the name, the number or the WhatsApp is missing", () => {
    expect(paymentDetailsMissing({ juiceName: "A", juiceNumber: "5", paymentWhatsapp: "5" })).toBe(false);
    expect(paymentDetailsMissing({ juiceName: "A", juiceNumber: "5", paymentWhatsapp: null })).toBe(true);
    expect(paymentDetailsMissing({ juiceName: "", juiceNumber: "5", paymentWhatsapp: "5" })).toBe(true);
  });
});

describe("proof on WhatsApp (S-278 AC3)", () => {
  test("wa.me with the international digits and the message encoded", () => {
    expect(proofHref("+230 5000 0001", "Order APB-0042: Rs 1,250 paid")).toBe("https://wa.me/23050000001?text=Order%20APB-0042%3A%20Rs%201%2C250%20paid");
  });

  test("a local 8-digit number gets +230", () => {
    expect(proofHref("5000 0001", "x")).toBe("https://wa.me/23050000001?text=x");
  });

  test("no number, or not a phone: no link", () => {
    expect(proofHref(null, "x")).toBeNull();
    expect(proofHref("call me", "x")).toBeNull();
  });
});
