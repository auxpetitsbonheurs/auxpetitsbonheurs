// S-024 AC4, AC7: the recovery email in English and French.
import { describe, expect, test } from "vitest";
import { BAKERY_NAME, invitationEmail, recoveryEmail } from "./templates.server";

// S-028 AC7: the invitation email in English and French.
describe("invitation email (S-028 AC7)", () => {
  const INVITE_LINK = "https://shop.test/admin/invite/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const details = { inviterName: "Sarah", role: "admin" as const, link: INVITE_LINK, expiresOn: "2026-11-19" };

  test.each([
    ["en", /Sarah invited you/, /as an Admin/, /valid until Thu 19 Nov/],
    ["fr", /Sarah vous invite/, /en tant qu(?:'|&#39;)administrateur/i, /valable jusqu(?:'|&#39;)au jeu\. 19 nov\./],
  ] as const)("%s carries the bakery name, the inviter, the role in plain words, the link and the expiry", (locale, inviter, role, expiry) => {
    const email = invitationEmail(locale, details);

    for (const body of [email.text, email.html]) {
      expect(body).toContain(BAKERY_NAME);
      expect(body).toMatch(inviter);
      expect(body).toMatch(role);
      expect(body).toMatch(expiry);
    }
    expect(email.text).toContain(INVITE_LINK);
    expect(email.html).toContain(INVITE_LINK);
    expect(email.html).toContain(`lang="${locale}"`);
    expect(email.subject).toContain(BAKERY_NAME);
  });

  test("an Owner invitation says Owner", () => {
    expect(invitationEmail("en", { ...details, role: "owner" }).text).toMatch(/as an Owner/);
    expect(invitationEmail("fr", { ...details, role: "owner" }).text).toMatch(/en tant que propriétaire/i);
  });

  test("nothing else personal: one URL, no email address, no password, no order data", () => {
    const email = invitationEmail("en", details);

    expect(email.text.match(/https?:\/\/\S+/g)).toEqual([INVITE_LINK]);
    expect(email.text).not.toMatch(/@|password:\s*\S|\border\b|\bRs\s?\d|APB-/i);
  });

  test("an inviter name with markup is escaped in the HTML", () => {
    expect(invitationEmail("en", { ...details, inviterName: "<b>Sarah</b>" }).html).not.toContain("<b>Sarah</b>");
  });
});

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

// Brand v0.3: the cream logo badge heads both emails, served as a PNG from the site itself.
describe("email logo (brand v0.3)", () => {
  test("shows the cream logo badge from the link's origin, named after the bakery", () => {
    const email = recoveryEmail("en", "https://shop.test/auth/confirm?token_hash=abc&type=recovery");

    expect(email.html).toContain(`<img src="https://shop.test/brand/logo-badge-cream-160.png" width="80" height="80" alt="${BAKERY_NAME}"`);
  });

  test("falls back to the bakery name as text when the link has no origin", () => {
    const email = recoveryEmail("en", "not a url");

    expect(email.html).not.toContain("<img");
    expect(email.html).toContain(`${BAKERY_NAME}</p>`);
  });
});
