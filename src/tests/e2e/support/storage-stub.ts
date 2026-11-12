// Local stand-in for the Supabase Storage endpoints the app calls (S-047), served by the
// GoTrue stub on the same port (SUPABASE_URL of the `e2e` environment): signed upload URLs,
// the browser's PUT to them (bucket limits as in migration 0001: 1 MB, JPEG/PNG/WebP),
// range reads with the service key, public reads for <img>, and removal. In memory only.
// `GET /__storage/object?path=` lets specs read back what was stored.
import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

const BUCKET = "public-images";
const MAX_BYTES = 1_048_576;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const objects = new Map<string, { body: Buffer; contentType: string }>();
const tokens = new Map<string, string>();

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, PUT, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "authorization, apikey, content-type, cache-control, x-upsert, range",
};

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json", ...CORS });
  response.end(JSON.stringify(body));
}

const serviceKey = (request: IncomingMessage) => (request.headers.authorization ?? "").startsWith("Bearer ");

function pathAfter(pathname: string, prefix: string): string | null {
  if (!pathname.startsWith(prefix)) return null;
  return decodeURIComponent(pathname.slice(prefix.length));
}

async function upload(request: IncomingMessage, response: ServerResponse, path: string, token: string | null) {
  if (!token || tokens.get(token) !== path) return json(response, 400, { error: "InvalidJWT" });
  const body = await readBody(request);
  const contentType = String(request.headers["content-type"] ?? "");
  if (body.length > MAX_BYTES) return json(response, 413, { error: "Payload too large" });
  if (!TYPES.has(contentType)) return json(response, 415, { error: "invalid_mime_type" });
  if (objects.has(path)) return json(response, 409, { error: "Duplicate" });
  objects.set(path, { body, contentType });
  tokens.delete(token);
  return json(response, 200, { Key: `${BUCKET}/${path}` });
}

function read(request: IncomingMessage, response: ServerResponse, path: string) {
  const object = objects.get(path);
  if (!object) return json(response, 400, { error: "not_found", message: "Object not found" });
  const range = /^bytes=(\d+)-(\d+)$/.exec(String(request.headers.range ?? ""));
  if (range) {
    const [start, end] = [Number(range[1]), Math.min(Number(range[2]), object.body.length - 1)];
    response.writeHead(206, { "content-type": object.contentType, "content-range": `bytes ${start}-${end}/${object.body.length}`, ...CORS });
    return response.end(object.body.subarray(start, end + 1));
  }
  response.writeHead(200, { "content-type": object.contentType, "content-length": object.body.length, ...CORS });
  return response.end(object.body);
}

/** Handles Storage routes; false when the request is not one of them. */
export function storageStub(request: IncomingMessage, response: ServerResponse, url: URL): boolean | Promise<unknown> {
  const { pathname } = url;
  if (!pathname.startsWith("/storage/v1/") && !pathname.startsWith("/__storage/")) return false;
  if (request.method === "OPTIONS") {
    // Echo the asked-for headers: the e2e fixtures add their own (cf-connecting-ip).
    const asked = String(request.headers["access-control-request-headers"] ?? "");
    response.writeHead(204, { ...CORS, ...(asked ? { "access-control-allow-headers": asked } : {}) });
    response.end();
    return true;
  }
  const signPath = pathAfter(pathname, `/storage/v1/object/upload/sign/${BUCKET}/`);
  if (signPath && request.method === "POST") {
    if (!serviceKey(request)) return (json(response, 401, { error: "Unauthorized" }), true);
    const token = randomBytes(16).toString("hex");
    tokens.set(token, signPath);
    return (json(response, 200, { url: `/object/upload/sign/${BUCKET}/${signPath.split("/").map(encodeURIComponent).join("/")}?token=${token}` }), true);
  }
  if (signPath && request.method === "PUT") return upload(request, response, signPath, url.searchParams.get("token"));
  const authenticated = pathAfter(pathname, `/storage/v1/object/authenticated/${BUCKET}/`);
  if (authenticated && request.method === "GET") {
    if (!serviceKey(request)) return (json(response, 401, { error: "Unauthorized" }), true);
    return (read(request, response, authenticated), true);
  }
  const publicPath = pathAfter(pathname, `/storage/v1/object/public/${BUCKET}/`);
  if (publicPath && request.method === "GET") return (read(request, response, publicPath), true);
  if (pathname === `/storage/v1/object/${BUCKET}` && request.method === "DELETE") {
    return readBody(request).then((body) => {
      const { prefixes } = JSON.parse(body.toString("utf8") || "{}") as { prefixes?: string[] };
      for (const path of prefixes ?? []) objects.delete(path);
      json(response, 200, (prefixes ?? []).map((name) => ({ name })));
    });
  }
  if (pathname === "/__storage/object" && request.method === "GET") return (read(request, response, url.searchParams.get("path") ?? ""), true);
  return (json(response, 404, { error: "not in the storage stub" }), true);
}
