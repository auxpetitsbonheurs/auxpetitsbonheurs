// Confirmation rendered without the database right after Place order (checkout spec AC48,
// contracts.md v0.31, ADR-0003 amendment 5): a short-lived signed cookie scoped to that order's
// /order/:token path. Anything that does not verify is ignored and the page reads the database.
import { describe, expect, test } from "vitest";
import { CONFIRMATION_COOKIE, type ConfirmationSnapshot, confirmationSigner } from "./confirmation-cookie.server";

const TOKEN = "A".repeat(42) + "B";
const OTHER_TOKEN = "C".repeat(43);
const PATH = `/fr/order/${TOKEN}`;
const NOW = new Date("2026-11-12T08:00:00Z");
const SNAPSHOT: ConfirmationSnapshot = { number: "APB-0042", locale: "fr", leftOut: ["Tarte au citron"] };

const signer = confirmationSigner("test-server-secret");
const request = (cookie?: string) => new Request(`http://localhost${PATH}/confirmed`, cookie ? { headers: { cookie } } : {});
const pair = (setCookie: string) => setCookie.slice(0, setCookie.indexOf(";"));
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

describe("confirmation cookie", () => {
  test("is HttpOnly, Secure, SameSite=Lax, scoped to that order's path, lives 10 minutes and holds no token", async () => {
    const cookie = await signer.cookie(TOKEN, SNAPSHOT, PATH, NOW);

    expect(cookie).toMatch(new RegExp(`^${CONFIRMATION_COOKIE}=[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]{43}; Max-Age=600; Path=${PATH}; HttpOnly; SameSite=Lax; Secure$`));
    expect(pair(cookie)).not.toContain(TOKEN);
    expect(cookie.length).toBeLessThan(400);
  });

  test("reads back what it wrote, for the same token, until it expires", async () => {
    const cookie = pair(await signer.cookie(TOKEN, SNAPSHOT, PATH, NOW));

    expect(await signer.read(request(cookie), TOKEN, minutes(9))).toEqual(SNAPSHOT);
    expect(await signer.read(request(cookie), TOKEN, minutes(10))).toBeUndefined();
  });

  test("a cookie made for another order does not open this one", async () => {
    const cookie = pair(await signer.cookie(OTHER_TOKEN, SNAPSHOT, PATH, NOW));
    expect(await signer.read(request(cookie), TOKEN, NOW)).toBeUndefined();
  });

  test("a changed payload, a changed signature or another secret is ignored", async () => {
    const cookie = pair(await signer.cookie(TOKEN, SNAPSHOT, PATH, NOW));
    const [name, value] = [cookie.slice(0, cookie.indexOf("=")), cookie.slice(cookie.indexOf("=") + 1)];
    const [payload, mac] = value.split(".") as [string, string];
    const forged = Buffer.from(JSON.stringify({ n: "APB-9999", l: "fr", o: [], x: 9_999_999_999 })).toString("base64url");

    expect(await signer.read(request(`${name}=${forged}.${mac}`), TOKEN, NOW)).toBeUndefined();
    expect(await signer.read(request(`${name}=${payload}.${mac.slice(0, -1)}${mac.endsWith("A") ? "B" : "A"}`), TOKEN, NOW)).toBeUndefined();
    expect(await confirmationSigner("another-secret").read(request(cookie), TOKEN, NOW)).toBeUndefined();
  });

  test("no cookie, junk or an oversized value gives nothing (and never throws)", async () => {
    expect(await signer.read(request(), TOKEN, NOW)).toBeUndefined();
    expect(await signer.read(request(`${CONFIRMATION_COOKIE}=junk`), TOKEN, NOW)).toBeUndefined();
    expect(await signer.read(request(`${CONFIRMATION_COOKIE}=a.b.c`), TOKEN, NOW)).toBeUndefined();
    expect(await signer.read(request(`${CONFIRMATION_COOKIE}=${"A".repeat(5000)}.${"A".repeat(43)}`), TOKEN, NOW)).toBeUndefined();
  });

  test("a signed payload of the wrong shape is ignored", async () => {
    const odd = await signer.cookie(TOKEN, { number: "", locale: "fr", leftOut: [] }, PATH, NOW);
    expect(await signer.read(request(pair(odd)), TOKEN, NOW)).toBeUndefined();
  });

  test("keeps at most 10 left-out names", async () => {
    const many = { ...SNAPSHOT, leftOut: Array.from({ length: 12 }, (_, i) => `Cake ${i}`) };
    const cookie = pair(await signer.cookie(TOKEN, many, PATH, NOW));
    expect((await signer.read(request(cookie), TOKEN, NOW))?.leftOut).toHaveLength(10);
  });
});
