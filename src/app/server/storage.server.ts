// Supabase Storage, server side (service role; never reaches the browser). Today: removing
// objects whose rows are gone (S-045 AC6). Every call has a timeout and throws on any
// failure, so the caller can queue the paths in `storage_purge` and move on.
import { createContext } from "react-router";

export interface StorageGateway {
  /** Removes `paths` from `bucket`; throws when Storage does not confirm it. */
  remove(bucket: string, paths: readonly string[]): Promise<void>;
}

export const STORAGE_TIMEOUT_MS = 3000;

/** The request's Storage gateway; null where none is configured (the delete then queues). */
export const storageContext = createContext<StorageGateway | null>(null);

export function supabaseStorage(options: { url: string; serviceRoleKey: string; fetch?: typeof fetch }): StorageGateway {
  const send = options.fetch ?? fetch;
  const base = options.url.replace(/\/+$/, "");
  return {
    async remove(bucket, paths) {
      if (paths.length === 0) return;
      const response = await send(`${base}/storage/v1/object/${encodeURIComponent(bucket)}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${options.serviceRoleKey}`, apikey: options.serviceRoleKey, "content-type": "application/json" },
        body: JSON.stringify({ prefixes: paths }),
        signal: AbortSignal.timeout(STORAGE_TIMEOUT_MS),
      });
      // The body is not read on purpose: it never carries anything the caller needs.
      if (!response.ok) throw new Error(`storage remove answered ${response.status}`);
    },
  };
}
