// Local stand-in for the Supabase Auth (GoTrue) endpoints the app calls, so e2e runs
// offline and deterministically against the real @supabase/ssr adapter: password and
// refresh-token grants, JWKS (ES256 key made at start), logout and health. Started by
// playwright.config.ts on 127.0.0.1:54321 (SUPABASE_URL of the `e2e` environment).
// Never deployed; holds only the placeholder accounts of auth-users.ts.
import { randomBytes } from "node:crypto";
import { type IncomingMessage, type ServerResponse, createServer } from "node:http";
import { createTestSigningKey, sessionBody, signTestJwt } from "../../../app/server/testing/test-jwt";
import { E2E_ACCOUNTS } from "./auth-users";

const PORT = Number(process.env.GOTRUE_STUB_PORT ?? 54321);
const key = await createTestSigningKey("e2e-stub");
const accounts = Object.values(E2E_ACCOUNTS);
const refreshTokens = new Map<string, { id: string; email: string; signedInAt: Date }>();

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

async function issue(user: { id: string; email: string }, signedInAt: Date) {
  const refresh = randomBytes(24).toString("base64url");
  refreshTokens.set(refresh, { ...user, signedInAt });
  const token = await signTestJwt(key, { sub: user.id, email: user.email, signedInAt });
  return sessionBody(token, refresh, user);
}

const INVALID = { code: "invalid_credentials", error_code: "invalid_credentials", msg: "Invalid login credentials" };

async function token(request: IncomingMessage, url: URL, response: ServerResponse) {
  const body = await readJson(request);
  if (url.searchParams.get("grant_type") === "password") {
    const account = accounts.find((a) => a.email === String(body.email ?? "").toLowerCase() && a.password === body.password);
    return account ? send(response, 200, await issue(account, new Date())) : send(response, 400, INVALID);
  }
  if (url.searchParams.get("grant_type") === "refresh_token") {
    const known = refreshTokens.get(String(body.refresh_token));
    if (!known) return send(response, 400, { code: "refresh_token_not_found", error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" });
    refreshTokens.delete(String(body.refresh_token));
    return send(response, 200, await issue(known, known.signedInAt));
  }
  return send(response, 400, { msg: "unsupported grant_type" });
}

createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${PORT}`);
  const route = `${request.method} ${url.pathname}`;
  if (route === "GET /auth/v1/health") return send(response, 200, { name: "GoTrue stub" });
  if (route === "GET /auth/v1/.well-known/jwks.json") return send(response, 200, { keys: [key.publicJwk] });
  if (route === "POST /auth/v1/token") return void token(request, url, response);
  if (route === "POST /auth/v1/logout") return send(response, 204);
  return send(response, 404, { msg: "not in the stub" });
}).listen(PORT, "127.0.0.1", () => console.log(`GoTrue stub on http://127.0.0.1:${PORT}`));
