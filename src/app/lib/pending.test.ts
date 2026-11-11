// Pending state for submit buttons: busy from the tap until the next page has loaded,
// including the redirect's loading phase (Place order lands on its confirmation page).
import { describe, expect, test } from "vitest";
import { isPendingIntent } from "./pending";

const form = (intent: string) => {
  const data = new FormData();
  data.set("intent", intent);
  return data;
};

describe("isPendingIntent", () => {
  test("busy while the form with that intent is submitting", () => {
    expect(isPendingIntent({ state: "submitting", formData: form("placeOrder") }, "placeOrder")).toBe(true);
  });

  test("still busy while the redirect after it loads (formData is kept)", () => {
    expect(isPendingIntent({ state: "loading", formData: form("placeOrder") }, "placeOrder")).toBe(true);
  });

  test("not busy when idle, on a plain navigation, or for another intent", () => {
    expect(isPendingIntent({ state: "idle", formData: undefined }, "placeOrder")).toBe(false);
    expect(isPendingIntent({ state: "loading", formData: undefined }, "placeOrder")).toBe(false);
    expect(isPendingIntent({ state: "submitting", formData: form("removeLine") }, "placeOrder")).toBe(false);
  });
});
