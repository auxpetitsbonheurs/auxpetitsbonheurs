// Supabase-shaped access tokens for tests only: an ES256 key pair made in process,
// its public JWKS, and tokens with the claims Supabase Auth issues (`sub`, `email`,
// `amr` with the sign-in time). Used by the HTTP-boundary unit tests of the real
// adapter and by the local GoTrue stub of the e2e harness. Never a real key.

export interface TestSigningKey {
  kid: string;
  privateKey: CryptoKey;
  publicJwk: JsonWebKey & { kid: string; alg: "ES256"; use: "sig" };
}

const ALGORITHM = { name: "ECDSA", namedCurve: "P-256" } as const;

export async function createTestSigningKey(kid = "test-key"): Promise<TestSigningKey> {
  const pair = (await crypto.subtle.generateKey(ALGORITHM, true, ["sign", "verify"])) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return { kid, privateKey: pair.privateKey, publicJwk: { ...jwk, kid, alg: "ES256", use: "sig", key_ops: ["verify"] } };
}

const base64url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
const encodeJson = (value: unknown) => base64url(new TextEncoder().encode(JSON.stringify(value)));

export interface TestTokenClaims {
  sub: string;
  email: string;
  /** Sign-in time (the `amr` timestamp Supabase keeps across refreshes). */
  signedInAt: Date;
  /** Issue time; `exp` is one hour later. Defaults to now. */
  issuedAt?: Date;
  sessionId?: string;
}

export async function signTestJwt(key: TestSigningKey, claims: TestTokenClaims): Promise<string> {
  const iat = Math.floor((claims.issuedAt ?? new Date()).getTime() / 1000);
  const header = encodeJson({ alg: "ES256", typ: "JWT", kid: key.kid });
  const payload = encodeJson({
    iss: "http://127.0.0.1:54321/auth/v1",
    aud: "authenticated",
    role: "authenticated",
    sub: claims.sub,
    email: claims.email,
    iat,
    exp: iat + 3600,
    aal: "aal1",
    amr: [{ method: "password", timestamp: Math.floor(claims.signedInAt.getTime() / 1000) }],
    session_id: claims.sessionId ?? crypto.randomUUID(),
    is_anonymous: false,
  });
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key.privateKey, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${base64url(new Uint8Array(signature))}`;
}

/** The session body GoTrue answers to `POST /token`. */
export function sessionBody(accessToken: string, refreshToken: string, user: { id: string; email: string }, now = new Date()) {
  const issued = Math.floor(now.getTime() / 1000);
  return {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: issued + 3600,
    refresh_token: refreshToken,
    user: {
      id: user.id,
      aud: "authenticated",
      role: "authenticated",
      email: user.email,
      email_confirmed_at: new Date(0).toISOString(),
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: {},
      identities: [],
      created_at: new Date(0).toISOString(),
      updated_at: now.toISOString(),
    },
  };
}
