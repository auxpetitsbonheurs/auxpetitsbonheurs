// Local stand-in for the Supabase Auth (GoTrue) endpoints the app calls, so e2e runs
// offline and deterministically against the real @supabase/ssr adapter: password and
// refresh-token grants, JWKS (ES256 key made at start), logout and health; password
// recovery (recover, verify, update user: S-025, S-026, S-036); plus the Storage
// endpoints in storage-stub.ts. Started by playwright.config.ts on 127.0.0.1:54321
// (SUPABASE_URL of the `e2e` environment). Never deployed; holds only placeholder accounts
// (auth-users.ts, and the throwaway ones specs add through `POST /__stub/users`).
import { randomBytes } from "node:crypto";
import { type IncomingMessage, type ServerResponse, createServer } from "node:http";
import { createTestSigningKey, sessionBody, signTestJwt } from "../../../app/server/testing/test-jwt";
import { E2E_ACCOUNTS } from "./auth-users";
import { storageStub } from "./storage-stub";

const PORT = Number(process.env.GOTRUE_STUB_PORT ?? 54321);
const key = await createTestSigningKey("e2e-stub");

interface StubUser {
  id: string;
  email: string;
  password: string;
}

const users = new Map<string, StubUser>(Object.values(E2E_ACCOUNTS).map((a) => [a.email, { id: a.id, email: a.email, password: a.password }]));
const refreshTokens = new Map<string, { user: StubUser; signedInAt: Date; method: string }>();
/** Recovery emails "sent", newest last per email: what the email would carry. */
const recoveries = new Map<string, { tokenHash: string; redirectTo: string }>();
const recoveryTokens = new Map<string, string>();

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

function send(response: ServerResponse, status: number, body?: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(body === undefined ? undefined : JSON.stringify(body));
}

async function issue(user: StubUser, signedInAt: Date, method = "password") {
  const refresh = randomBytes(24).toString("base64url");
  refreshTokens.set(refresh, { user, signedInAt, method });
  const token = await signTestJwt(key, { sub: user.id, email: user.email, signedInAt, method });
  return sessionBody(token, refresh, user);
}

const INVALID = { code: "invalid_credentials", error_code: "invalid_credentials", msg: "Invalid login credentials" };
const EXPIRED = { code: "otp_expired", error_code: "otp_expired", msg: "Email link is invalid or has expired" };

async function token(request: IncomingMessage, url: URL, response: ServerResponse) {
  const body = await readJson(request);
  if (url.searchParams.get("grant_type") === "password") {
    const user = users.get(String(body.email ?? "").toLowerCase());
    return user && user.password === body.password ? send(response, 200, await issue(user, new Date())) : send(response, 400, INVALID);
  }
  if (url.searchParams.get("grant_type") === "refresh_token") {
    const known = refreshTokens.get(String(body.refresh_token));
    if (!known) return send(response, 400, { code: "refresh_token_not_found", error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" });
    refreshTokens.delete(String(body.refresh_token));
    return send(response, 200, await issue(known.user, known.signedInAt, known.method));
  }
  return send(response, 400, { msg: "unsupported grant_type" });
}

async function recover(request: IncomingMessage, url: URL, response: ServerResponse) {
  const email = String((await readJson(request)).email ?? "").toLowerCase();
  if (users.has(email)) {
    const tokenHash = randomBytes(28).toString("hex");
    recoveryTokens.set(tokenHash, email);
    recoveries.set(email, { tokenHash, redirectTo: url.searchParams.get("redirect_to") ?? "" });
  }
  return send(response, 200, {});
}

async function verify(request: IncomingMessage, response: ServerResponse) {
  const body = await readJson(request);
  const email = recoveryTokens.get(String(body.token_hash));
  const user = email ? users.get(email) : undefined;
  if (body.type !== "recovery" || !user) return send(response, 403, EXPIRED);
  recoveryTokens.delete(String(body.token_hash));
  return send(response, 200, await issue(user, new Date(), "recovery"));
}

/** The bearer token's user (the stub trusts its own tokens; the app verified them already). */
function bearerUser(request: IncomingMessage): StubUser | undefined {
  const jwt = (request.headers.authorization ?? "").replace(/^Bearer /, "");
  try {
    const { sub } = JSON.parse(Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString("utf8")) as { sub?: string };
    return [...users.values()].find((user) => user.id === sub);
  } catch {
    return undefined;
  }
}

async function updateUser(request: IncomingMessage, response: ServerResponse) {
  const user = bearerUser(request);
  if (!user) return send(response, 401, { code: "bad_jwt", error_code: "bad_jwt", msg: "invalid JWT" });
  const body = await readJson(request);
  if (typeof body.password === "string") {
    if (body.password === user.password) return send(response, 422, { code: "same_password", error_code: "same_password", msg: "New password should be different" });
    user.password = body.password;
  }
  return send(response, 200, sessionBody("unused", "unused", user).user);
}

/** Test-only: a throwaway account (spec-made admins whose password a spec may change). */
async function addUser(request: IncomingMessage, response: ServerResponse) {
  const body = await readJson(request);
  const user = { id: String(body.id), email: String(body.email).toLowerCase(), password: String(body.password) };
  users.set(user.email, user);
  return send(response, 201, { id: user.id });
}

createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${PORT}`);
  const route = `${request.method} ${url.pathname}`;
  if (storageStub(request, response, url) !== false) return;
  if (route === "GET /auth/v1/health") return send(response, 200, { name: "GoTrue stub" });
  if (route === "GET /auth/v1/.well-known/jwks.json") return send(response, 200, { keys: [key.publicJwk] });
  if (route === "POST /auth/v1/token") return void token(request, url, response);
  if (route === "POST /auth/v1/logout") return send(response, 204);
  if (route === "POST /auth/v1/recover") return void recover(request, url, response);
  if (route === "POST /auth/v1/verify") return void verify(request, response);
  if (route === "PUT /auth/v1/user") return void updateUser(request, response);
  if (route === "POST /__stub/users") return void addUser(request, response);
  if (route === "GET /__stub/recovery") {
    const sent = recoveries.get((url.searchParams.get("email") ?? "").toLowerCase());
    return sent ? send(response, 200, sent) : send(response, 404, { msg: "no recovery email" });
  }
  return send(response, 404, { msg: "not in the stub" });
}).listen(PORT, "127.0.0.1", () => console.log(`GoTrue stub on http://127.0.0.1:${PORT}`));
