// S-024 AC4, AC7: the recovery email in English and French.
import { describe, expect, test } from "vitest";
import { BAKERY_NAME, recoveryEmail } from "./templates.server";

const LINK = "https://shop.test/auth/confirm?token_hash=abc&type=recovery&next=/admin/reset";

describe("recovery email (AC4)", () => {
  test.each(["en", "fr"] as const)("%s carries the bakery name, a reason, the link and the expiry", (locale) => {
    const email = recoveryEmail(locale, LINK);

    for (const body of [email.text, email.html]) {
      expect(body).toContain(BAKERY_NAME);
      expect(body).toMatch(locale === "en" ? /asked to reset the password/ : /demandé à réinitialiser/);
      expect(body).toMatch(locale === "en" ? /works for 1 hour/ : /valable 1 heure/);
    }
    expect(email.text).toContain(LINK);
    expect(email.html).toContain(LINK.replaceAll("&", "&amp;"));
    expect(email.html).toContain(`lang="${locale}"`);
    expect(email.subject).toContain(BAKERY_NAME);
  });

  test("English and French differ", () => {
    expect(recoveryEmail("fr", LINK).subject).not.toBe(recoveryEmail("en", LINK).subject);
  });
});

describe("content limits (AC7)", () => {
  test("only the link as a URL; no password, no order data", () => {
    const email = recoveryEmail("en", LINK);
    const urls = email.text.match(/https?:\/\/\S+/g);

    expect(urls).toEqual([LINK]);
    expect(email.text).not.toMatch(/password:\s*\S|\border\b|\bRs\s?\d|APB-/i);
    expect(email.html.match(/href="([^"]+)"/g)?.every((href) => href.includes("/auth/confirm?"))).toBe(true);
  });

  test("a link with markup in it is escaped in the HTML", () => {
    const email = recoveryEmail("en", 'https://shop.test/auth/confirm?x="><script>');

    expect(email.html).not.toContain("<script>");
  });
});
