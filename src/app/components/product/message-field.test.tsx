// S-067 AC1, AC3, AC7: the message field's limit rule and its server-rendered markup.
// Typing, pasting and announcements in a browser: src/tests/e2e/product-options.spec.ts.
import { describe, expect, test } from "vitest";
import { renderInSite } from "~/server/testing/render-in-site";
import { MessageField, acceptMessageInput, counterAnnouncement } from "./message-field";

const field = (value: string, max = 40, path = "/") =>
  renderInSite(<MessageField id="cakeMessage" name="cakeMessage" label="Message on the cake" hint="Optional." max={max} value={value} onChange={() => {}} />, path);

describe("limit rule (AC1, AC3, AC7)", () => {
  test("the 41st character is not accepted; the 40th is", () => {
    expect(acceptMessageInput("a".repeat(39), "a".repeat(40), 40)).toEqual({ value: "a".repeat(40), refused: null });
    expect(acceptMessageInput("a".repeat(40), "a".repeat(41), 40)).toEqual({ value: "a".repeat(40), refused: "typed" });
  });

  test("a paste over the limit is refused whole and reported, never cut", () => {
    expect(acceptMessageInput("Happy ", `Happy ${"b".repeat(50)}`, 40)).toEqual({ value: "Happy ", refused: "pasted" });
  });

  test("emoji count once each: 40 cakes fit, a 41st does not", () => {
    expect(acceptMessageInput("🎂".repeat(39), "🎂".repeat(40), 40).refused).toBeNull();
    expect(acceptMessageInput("🎂".repeat(40), "🎂".repeat(41), 40).refused).toBe("typed");
  });

  test("announces only at thresholds: 10 left, then the limit", () => {
    expect([29, 30, 31, 39, 40].map((count) => counterAnnouncement(count, 40))).toEqual([null, "few", null, null, "limit"]);
  });
});

describe("markup (AC1, AC7)", () => {
  test("a visible label, the counter tied with aria-describedby, no native maxlength", () => {
    const html = field("Happy birthday");

    expect(html).toContain('<label for="cakeMessage"');
    expect(html).toMatch(/aria-describedby="cakeMessage-hint cakeMessage-counter"/);
    expect(html).toMatch(/id="cakeMessage-counter"[^>]*>14 \/ 40/);
    expect(html).not.toContain("maxlength");
  });

  test("at the limit the counter reads 40 / 40 in the danger colour with words, not colour only", () => {
    const html = field("a".repeat(40));

    expect(html).toMatch(/id="cakeMessage-counter" class="[^"]*text-destructive[^"]*">40 \/ 40<span> · Limit reached: 40 characters<\/span>/);
  });

  test("in French", () => {
    expect(field("a".repeat(40), 40, "/fr")).toContain("Limite atteinte : 40 caractères");
  });
});
