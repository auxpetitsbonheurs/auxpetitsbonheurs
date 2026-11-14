// Standard Web Push for the installed admin app (S-196, ADR-0001 "Web Push VAPID"): VAPID
// authentication (RFC 8292) and aes128gcm payload encryption (RFC 8291 over RFC 8188), on
// WebCrypto only, so it runs in the Worker with no paid push service and no dependency.
// Cost per device: one ECDH key pair, one ECDH, three HKDF and one AES-GCM (native, well under
// a millisecond of CPU); the VAPID token is signed once per push-service origin per batch.
// The private key arrives from typed env (VAPID_PRIVATE_KEY) and is never logged.

const subtle = () => globalThis.crypto.subtle;
const encoder = new TextEncoder();

/** Records are at most 4096 bytes; a push payload (≤ 4 kB) is always one final record. */
const RECORD_SIZE = 4096;
/** A token may live up to 24 h (RFC 8292); 12 h leaves room for clock skew at the push service. */
const VAPID_TTL_SECONDS = 12 * 3600;

export interface VapidKeys {
  /** Uncompressed P-256 point, base64url (65 bytes): also the browser's `applicationServerKey`. */
  publicKey: string;
  /** The private scalar `d`, base64url (32 bytes). Secret. */
  privateKey: string;
}

export interface VapidConfig extends VapidKeys {
  /** `mailto:` or `https:` contact for the push service operator (RFC 8292 section 2.1). */
  subject: string;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new TypeError("not base64url");
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const buffer = (bytes: Uint8Array) => bytes as BufferSource;

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await subtle().importKey("raw", buffer(ikm), "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await subtle().deriveBits({ name: "HKDF", hash: "SHA-256", salt: buffer(salt), info: buffer(info) }, key, length * 8));
}

/** A browser key must be an uncompressed P-256 point (65 bytes, 0x04 first). */
function publicPoint(value: string): Uint8Array {
  const bytes = base64UrlDecode(value);
  if (bytes.length !== 65 || bytes[0] !== 4) throw new TypeError("not an uncompressed P-256 key");
  return bytes;
}

/**
 * The request body for one subscription (RFC 8291 section 3.4): header (salt, record size,
 * the server's ephemeral public key) then the AES-128-GCM ciphertext of `payload` + 0x02.
 */
export async function encryptPayload(payload: string, p256dh: string, authSecret: string): Promise<Uint8Array> {
  const uaPublic = publicPoint(p256dh);
  const auth = base64UrlDecode(authSecret);
  if (auth.length !== 16) throw new TypeError("auth secret must be 16 bytes");
  const uaKey = await subtle().importKey("raw", buffer(uaPublic), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const server = (await subtle().generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const asPublic = new Uint8Array(await subtle().exportKey("raw", server.publicKey));
  const shared = new Uint8Array(await subtle().deriveBits({ name: "ECDH", public: uaKey }, server.privateKey, 256));
  const ikm = await hkdf(auth, shared, concat(encoder.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);
  const key = await subtle().importKey("raw", buffer(cek), "AES-GCM", false, ["encrypt"]);
  const plaintext = concat(encoder.encode(payload), new Uint8Array([2]));
  const ciphertext = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv: buffer(nonce) }, key, buffer(plaintext)));
  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = asPublic.length;
  return concat(header, asPublic, ciphertext);
}

async function signingKey(keys: VapidKeys): Promise<CryptoKey> {
  const point = publicPoint(keys.publicKey);
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: base64UrlEncode(point.slice(1, 33)),
    y: base64UrlEncode(point.slice(33, 65)),
    d: keys.privateKey,
    ext: false,
  };
  return subtle().importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

const jsonPart = (value: object) => base64UrlEncode(encoder.encode(JSON.stringify(value)));

/** The `Authorization` header for a push to `endpoint` (RFC 8292 section 3, "vapid" scheme). */
export async function vapidAuthorization(endpoint: string, config: VapidConfig, now: Date): Promise<string> {
  const audience = new URL(endpoint).origin;
  const unsigned = `${jsonPart({ typ: "JWT", alg: "ES256" })}.${jsonPart({ aud: audience, exp: Math.floor(now.getTime() / 1000) + VAPID_TTL_SECONDS, sub: config.subject })}`;
  // WebCrypto's ECDSA signature is already the raw r||s form JWS wants.
  const signature = new Uint8Array(await subtle().sign({ name: "ECDSA", hash: "SHA-256" }, await signingKey(config), buffer(encoder.encode(unsigned))));
  return `vapid t=${unsigned}.${base64UrlEncode(signature)}, k=${config.publicKey}`;
}

/** A new VAPID key pair (used by scripts/generate-vapid-keys.ts and tests). */
export async function generateVapidKeys(): Promise<VapidKeys> {
  const pair = (await subtle().generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const publicKey = new Uint8Array(await subtle().exportKey("raw", pair.publicKey));
  const jwk = await subtle().exportKey("jwk", pair.privateKey);
  return { publicKey: base64UrlEncode(publicKey), privateKey: jwk.d! };
}
