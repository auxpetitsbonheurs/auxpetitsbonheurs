// One TCP write per query on Cloudflare Workers (ADR-0003 amendment 3). node-postgres sends a
// parameterised query as five protocol messages (Parse, Bind, Describe, Execute, Sync) and
// corks the socket around them, but pg-cloudflare's socket has no cork(): each message becomes
// its own small write, and the later ones wait for the first one's ACK (Nagle), one extra
// round trip to the Supabase region per query (staging: ~400 ms per query instead of ~190).
// This socket buffers between cork() and uncork() and writes the batch at once.
import * as cloudflare from "pg-cloudflare";

type WriteCallback = (error?: unknown) => void;

interface Writable {
  write(data: Uint8Array | string, encodingOrCallback?: BufferEncoding | WriteCallback, callback?: WriteCallback): unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TypeScript requires `any[]` for a mixin base's constructor
type WritableClass = new (...args: any[]) => Writable;

const toBytes = (data: Uint8Array | string, encoding?: BufferEncoding) => (typeof data === "string" ? Buffer.from(data, encoding ?? "utf8") : data);

/** Adds cork()/uncork() to a socket class: writes in between are sent as one. */
export function withCork<T extends WritableClass>(Base: T) {
  return class CorkedSocket extends Base {
    corked: Uint8Array[] | null = null;

    cork(): void {
      this.corked ??= [];
    }

    uncork(): void {
      const parts = this.corked;
      this.corked = null;
      if (parts && parts.length > 0) super.write(parts.length === 1 ? parts[0]! : Buffer.concat(parts));
    }

    override write(data: Uint8Array | string, encodingOrCallback?: BufferEncoding | WriteCallback, callback?: WriteCallback): unknown {
      if (!this.corked) return super.write(data, encodingOrCallback, callback);
      const encoding = typeof encodingOrCallback === "string" ? encodingOrCallback : undefined;
      this.corked.push(toBytes(data, encoding));
      (typeof encodingOrCallback === "function" ? encodingOrCallback : callback)?.();
      return true;
    }
  };
}

/** The `stream` option for node-postgres on Workers; undefined elsewhere (Node sockets cork natively). */
export function workersSocketFactory(): ((config: { ssl?: unknown }) => unknown) | undefined {
  const Base = (cloudflare as { CloudflareSocket?: WritableClass }).CloudflareSocket;
  if (typeof Base !== "function") return undefined;
  const Corked = withCork(Base);
  return (config) => new Corked(Boolean(config.ssl));
}
