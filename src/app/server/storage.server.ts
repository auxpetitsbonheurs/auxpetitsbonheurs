// Supabase Storage, server side (service role; never reaches the browser): removing objects
// whose rows are gone (S-045 AC6), issuing signed upload URLs for one path each and reading
// back what was stored before a save trusts it (S-047). Every call has a timeout and throws
// on any failure; the key and the token are never logged or put in an error message.
import { createContext } from "react-router";

export interface StorageGateway {
  /** Removes `paths` from `bucket`; throws when Storage does not confirm it. */
  remove(bucket: string, paths: readonly string[]): Promise<void>;
}

export const STORAGE_TIMEOUT_MS = 3000;

/** A signed URL the browser PUTs one file to (valid 2 hours, one path, no overwrite). */
export interface SignedUpload {
  path: string;
  signedUrl: string;
  token: string;
}

/** What Storage holds at a path: its size, declared type and first bytes (for the magic number). */
export interface StoredObject {
  size: number;
  contentType: string;
  head: Uint8Array;
}

export interface UploadGateway {
  signUpload(bucket: string, path: string): Promise<SignedUpload>;
  /** The stored object, or null when nothing is at `path`. */
  inspect(bucket: string, path: string): Promise<StoredObject | null>;
}

/** The request's Storage gateway; null where none is configured (the delete then queues). */
export const storageContext = createContext<StorageGateway | null>(null);
/** Upload signing and checks; null where none is configured (uploads are then refused). */
export const uploadContext = createContext<UploadGateway | null>(null);

/** Bytes read back from a stored object: enough for every magic number we check. */
export const HEAD_BYTES = 16;

const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

async function readHead(response: Response): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: number[] = [];
  while (chunks.length < HEAD_BYTES) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(...value.slice(0, HEAD_BYTES - chunks.length));
  }
  await reader.cancel().catch(() => {});
  return new Uint8Array(chunks);
}

/** Total size from `Content-Range: bytes 0-15/12345`, else Content-Length (a 200 without range). */
function totalSize(response: Response): number {
  const range = /\/(\d+)$/.exec(response.headers.get("content-range") ?? "");
  if (range) return Number(range[1]);
  return Number(response.headers.get("content-length") ?? Number.NaN);
}

export function supabaseStorage(options: { url: string; serviceRoleKey: string; fetch?: typeof fetch }): StorageGateway & UploadGateway {
  const send = options.fetch ?? fetch;
  const base = options.url.replace(/\/+$/, "");
  const auth = { authorization: `Bearer ${options.serviceRoleKey}`, apikey: options.serviceRoleKey };
  return {
    async signUpload(bucket, path) {
      const response = await send(`${base}/storage/v1/object/upload/sign/${encodeURIComponent(bucket)}/${encodePath(path)}`, {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(STORAGE_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`storage sign answered ${response.status}`);
      const body = (await response.json()) as { url?: unknown };
      const relative = typeof body.url === "string" ? body.url : "";
      const token = new URL(relative, "https://x").searchParams.get("token");
      if (!relative.startsWith("/") || !token) throw new Error("storage sign answered without a token");
      return { path, signedUrl: `${base}/storage/v1${relative}`, token };
    },
    async inspect(bucket, path) {
      const response = await send(`${base}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${encodePath(path)}`, {
        headers: { ...auth, range: `bytes=0-${HEAD_BYTES - 1}` },
        signal: AbortSignal.timeout(STORAGE_TIMEOUT_MS),
      });
      if (response.status === 404 || response.status === 400) {
        await response.body?.cancel();
        return null; // Supabase answers 400 "Object not found" on some versions
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`storage inspect answered ${response.status}`);
      }
      return { size: totalSize(response), contentType: (response.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase(), head: await readHead(response) };
    },
    async remove(bucket, paths) {
      if (paths.length === 0) return;
      const response = await send(`${base}/storage/v1/object/${encodeURIComponent(bucket)}`, {
        method: "DELETE",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ prefixes: paths }),
        signal: AbortSignal.timeout(STORAGE_TIMEOUT_MS),
      });
      // The body is not read on purpose: it never carries anything the caller needs.
      if (!response.ok) throw new Error(`storage remove answered ${response.status}`);
    },
  };
}
