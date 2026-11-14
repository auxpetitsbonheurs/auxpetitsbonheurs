// S-196: standard Web Push (RFC 8030) with VAPID (RFC 8292) and aes128gcm payload
// encryption (RFC 8291), on WebCrypto only (no paid service, no Node crypto in the Worker).
// The tests play the browser: they decrypt what we send with the subscription's private key
// and verify the VAPID token with the public key.
import { describe, expect, test } from "vitest";
import { base64UrlDecode, base64UrlEncode, encryptPayload, generateVapidKeys, vapidAuthorization } from "./web-push.server";

const subtle = globalThis.crypto.subtle;

async function browserSubscription() {
  const pair = (await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const p256dh = new Uint8Array(await subtle.exportKey("raw", pair.publicKey));
  const auth = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return { privateKey: pair.privateKey, p256dh, auth };
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) {
  const key = await subtle.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: info as BufferSource }, key, length * 8));
}

const text = (value: string) => new TextEncoder().encode(value);
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

/** The user agent's side of RFC 8291 section 3.4 and RFC 8188. */
async function decrypt(body: Uint8Array, sub: Awaited<ReturnType<typeof browserSubscription>>) {
  const salt = body.slice(0, 16);
  const rs = new DataView(body.buffer, body.byteOffset).getUint32(16);
  const idLength = body[20]!;
  const asPublic = body.slice(21, 21 + idLength);
  const ciphertext = body.slice(21 + idLength);
  const serverKey = await subtle.importKey("raw", asPublic as BufferSource, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await subtle.deriveBits({ name: "ECDH", public: serverKey }, sub.privateKey, 256));
  const ikm = await hkdf(sub.auth, shared, concat(text("WebPush: info\0"), sub.p256dh, asPublic), 32);
  const cek = await hkdf(salt, ikm, text("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, text("Content-Encoding: nonce\0"), 12);
  const key = await subtle.importKey("raw", cek as BufferSource, "AES-GCM", false, ["decrypt"]);
  const padded = new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: nonce as BufferSource }, key, ciphertext as BufferSource));
  let end = padded.length - 1;
  while (padded[end] === 0) end -= 1;
  return { rs, delimiter: padded[end], plaintext: new TextDecoder().decode(padded.slice(0, end)), idLength };
}

describe("payload encryption (RFC 8291 aes128gcm)", () => {
  test("the subscribed browser decrypts exactly the JSON we sent, as one final record", async () => {
    const sub = await browserSubscription();
    const payload = JSON.stringify({ title: "New order APB-0042", body: "Sarah", url: "/admin/orders/x", tag: "new_order:x" });

    const body = await encryptPayload(payload, base64UrlEncode(sub.p256dh), base64UrlEncode(sub.auth));
    const opened = await decrypt(body, sub);

    expect(opened.plaintext).toBe(payload);
    expect(opened.delimiter).toBe(2);
    expect(opened.idLength).toBe(65);
    expect(opened.rs).toBe(4096);
  });

  test("each message uses a fresh salt and server key (no reuse across sends)", async () => {
    const sub = await browserSubscription();
    const a = await encryptPayload("x", base64UrlEncode(sub.p256dh), base64UrlEncode(sub.auth));
    const b = await encryptPayload("x", base64UrlEncode(sub.p256dh), base64UrlEncode(sub.auth));

    expect(base64UrlEncode(a.slice(0, 86))).not.toBe(base64UrlEncode(b.slice(0, 86)));
  });

  test("a malformed subscription key is refused before anything is sent", async () => {
    await expect(encryptPayload("x", "not-a-key", base64UrlEncode(new Uint8Array(16)))).rejects.toThrow();
  });
});

describe("VAPID (RFC 8292)", () => {
  test("the token is an ES256 JWT for the push service origin, valid 12 hours, verifiable with the public key", async () => {
    const keys = await generateVapidKeys();
    const now = new Date("2026-11-13T10:00:00Z");

    const header = await vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc", { ...keys, subject: "mailto:owner@example.com" }, now);

    const match = /^vapid t=([^,]+), k=(.+)$/.exec(header);
    expect(match?.[2]).toBe(keys.publicKey);
    const [h, p, s] = match![1]!.split(".");
    expect(JSON.parse(new TextDecoder().decode(base64UrlDecode(h!)))).toEqual({ typ: "JWT", alg: "ES256" });
    expect(JSON.parse(new TextDecoder().decode(base64UrlDecode(p!)))).toEqual({
      aud: "https://fcm.googleapis.com",
      exp: Math.floor(now.getTime() / 1000) + 12 * 3600,
      sub: "mailto:owner@example.com",
    });
    const publicKey = await subtle.importKey("raw", base64UrlDecode(keys.publicKey) as BufferSource, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const valid = await subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, base64UrlDecode(s!) as BufferSource, text(`${h}.${p}`) as BufferSource);
    expect(valid).toBe(true);
  });

  test("generated keys have the sizes browsers expect (65-byte public, 32-byte private)", async () => {
    const keys = await generateVapidKeys();
    expect(base64UrlDecode(keys.publicKey)).toHaveLength(65);
    expect(base64UrlDecode(keys.privateKey)).toHaveLength(32);
  });
});
