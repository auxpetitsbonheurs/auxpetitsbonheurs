// Database and Auth reachability (S-020): shared by `/healthz` and the keepAlive job.
// Failures are reported by part name only; no error text, versions or secrets leave here.
import { sql } from "drizzle-orm";
import type { Executor } from "./db.server";

export const HEALTH_TIMEOUT_MS = 5_000;

export interface SupabaseEndpoint {
  url: string;
  anonKey: string;
}

export type PartStatus = "ok" | "fail";

export interface HealthReport {
  ok: boolean;
  db: PartStatus;
  auth: PartStatus;
}

export class HealthCheckError extends Error {
  constructor(part: "db" | "auth") {
    super(`${part} health check failed`);
    this.name = "HealthCheckError";
  }
}

async function withTimeout<T>(work: Promise<T>, timeoutMs: number, part: "db" | "auth"): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new HealthCheckError(part)), timeoutMs);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** `select 1`, failing after `timeoutMs`. */
export async function pingDatabase(db: Executor, timeoutMs = HEALTH_TIMEOUT_MS): Promise<void> {
  await withTimeout(db.execute(sql`select 1`), timeoutMs, "db");
}

/** `GET {SUPABASE_URL}/auth/v1/health` (the gateway needs the public anon key), aborted after `timeoutMs`. */
export async function pingAuth(endpoint: SupabaseEndpoint, fetchFn: typeof fetch = fetch, timeoutMs = HEALTH_TIMEOUT_MS): Promise<void> {
  const response = await fetchFn(`${endpoint.url}/auth/v1/health`, {
    headers: { apikey: endpoint.anonKey },
    signal: AbortSignal.timeout(timeoutMs),
  });
  await response.body?.cancel();
  if (!response.ok) throw new HealthCheckError("auth");
}

const statusOf = (result: PromiseSettledResult<unknown>): PartStatus => (result.status === "fulfilled" ? "ok" : "fail");

export async function checkHealth(db: Executor, endpoint: SupabaseEndpoint, fetchFn: typeof fetch = fetch): Promise<HealthReport> {
  const [database, auth] = await Promise.allSettled([pingDatabase(db), pingAuth(endpoint, fetchFn)]);
  const report = { db: statusOf(database), auth: statusOf(auth) };
  return { ok: report.db === "ok" && report.auth === "ok", ...report };
}
