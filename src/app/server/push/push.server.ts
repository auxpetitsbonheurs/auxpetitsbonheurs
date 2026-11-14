// Push sender (S-196; contracts.md "Push payload"): one encrypted POST per device, 5 s
// timeout each, all devices in parallel, run after the response (afterResponse) or from the
// hourly tick, so a slow push service never blocks the action that caused it (AC6).
// 404/410 = the browser dropped the subscription: the row is deleted (AC4). Outcomes are
// logged as counters (event type and status class only, never the endpoint: it identifies a
// device). The payload is exactly `{ title, body, url, tag }` (AC7: builders put the order
// number and first name only in it).
import { createContext } from "react-router";
import { and, eq, sql } from "drizzle-orm";
import { pushSubscription } from "~/db/schema";
import type { Executor } from "~/server/db.server";
import { type VapidConfig, encryptPayload, vapidAuthorization } from "./web-push.server";

export const PUSH_TIMEOUT_MS = 5000;
/** The push service keeps an undelivered message this long (phone off overnight still gets it). */
const PUSH_TTL_SECONDS = 12 * 3600;

export interface PushPayload {
  title: string;
  body: string;
  /** `/admin/orders/<id>` or `/admin/calendar/<date>/prep` (contracts.md). */
  url: string;
  /** `<event>:<id>`: a repeat replaces the earlier notification on the device (S-195 AC11). */
  tag: string;
}

export interface PushDevice {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type PushOutcome = "sent" | "gone" | "failed" | "timeout";

export interface Pusher {
  send(device: PushDevice, payload: PushPayload): Promise<{ outcome: PushOutcome; status?: number }>;
}

/** Request context: null while the VAPID keys are not set (push off, profile says so calmly). */
export interface PushConfig {
  pusher: Pusher | null;
  /** Browser `applicationServerKey`; null while push is off. */
  publicKey: string | null;
}

export const pushContext = createContext<PushConfig>({ pusher: null, publicKey: null });

/** Only the four contract fields leave the server, whatever the caller built (AC7). */
export function payloadJson(payload: PushPayload): string {
  return JSON.stringify({ title: payload.title, body: payload.body, url: payload.url, tag: payload.tag });
}

export interface WebPusherOptions {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  now: () => Date;
}

/** Standard Web Push with VAPID; tokens are signed once per push-service origin per pusher. */
export function webPusher(config: VapidConfig, options: WebPusherOptions): Pusher {
  const fetcher = options.fetch ?? globalThis.fetch;
  const tokens = new Map<string, Promise<string>>();
  const authorization = (endpoint: string) => {
    const origin = new URL(endpoint).origin;
    let token = tokens.get(origin);
    if (!token) {
      token = vapidAuthorization(endpoint, config, options.now());
      tokens.set(origin, token);
    }
    return token;
  };
  return {
    async send(device, payload) {
      const timeoutMs = options.timeoutMs ?? PUSH_TIMEOUT_MS;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<{ outcome: PushOutcome }>((resolve) => {
        timer = setTimeout(() => resolve({ outcome: "timeout" }), timeoutMs);
      });
      const attempt = (async () => {
        const body = await encryptPayload(payloadJson(payload), device.p256dh, device.auth);
        const response = await fetcher(device.endpoint, {
          method: "POST",
          headers: {
            authorization: await authorization(device.endpoint),
            "content-encoding": "aes128gcm",
            "content-type": "application/octet-stream",
            ttl: String(PUSH_TTL_SECONDS),
            urgency: "high",
          },
          body: body as BodyInit,
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (response.status === 404 || response.status === 410) return { outcome: "gone" as const, status: response.status };
        return { outcome: response.ok ? ("sent" as const) : ("failed" as const), status: response.status };
      })().catch(() => ({ outcome: "failed" as const }));
      try {
        return await Promise.race([attempt, timeout]);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/**
 * The push context from validated env (S-196 AC8): off (calmly, with a log line naming the
 * missing keys only) until VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT are set.
 */
export function pushConfigFromEnv(env: Readonly<Record<string, unknown>>, now: () => Date, fetch?: typeof globalThis.fetch): PushConfig {
  const publicKey = env.VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  const subject = env.VAPID_SUBJECT;
  const valid =
    typeof publicKey === "string" && /^[A-Za-z0-9_-]{87}$/.test(publicKey) &&
    typeof privateKey === "string" && /^[A-Za-z0-9_-]{43}$/.test(privateKey) &&
    typeof subject === "string" && /^(mailto:|https:)/.test(subject);
  if (!valid) {
    // Set but not usable (a placeholder copied from .dev.vars.example): names only, never values.
    if (publicKey || privateKey) console.log(JSON.stringify({ level: "warn", event: "push_not_configured", keys: ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"] }));
    return { pusher: null, publicKey: null };
  }
  return { pusher: webPusher({ publicKey, privateKey, subject }, { now, fetch }), publicKey };
}

export interface PushJob {
  device: PushDevice;
  payload: PushPayload;
}

export interface PushReport {
  sent: number;
  gone: number;
  failed: number;
}

const statusClass = (status?: number) => (status ? `${Math.floor(status / 100)}xx` : "none");

/**
 * Sends every job in parallel and records the outcome on each subscription; `event` names the
 * counter (`new_order`, `evening_reminder`, `test`, …). Never throws.
 */
export async function sendPushes(db: Executor, pusher: Pusher, event: string, jobs: readonly PushJob[], now: Date): Promise<PushReport> {
  const report: PushReport = { sent: 0, gone: 0, failed: 0 };
  await Promise.all(
    jobs.map(async ({ device, payload }) => {
      const { outcome, status } = await pusher.send(device, payload).catch(() => ({ outcome: "failed" as const, status: undefined }));
      const counter = outcome === "sent" ? "push_sent" : outcome === "gone" ? "push_gone" : "push_failed";
      console.log(JSON.stringify({ level: outcome === "sent" ? "info" : "warn", event: counter, type: event, status: outcome === "timeout" ? "timeout" : statusClass(status) }));
      try {
        if (outcome === "sent") {
          report.sent += 1;
          await db.update(pushSubscription).set({ lastSuccessAt: now, failureCount: 0 }).where(eq(pushSubscription.id, device.id));
        } else if (outcome === "gone") {
          report.gone += 1;
          await db.delete(pushSubscription).where(eq(pushSubscription.id, device.id));
        } else {
          report.failed += 1;
          await db.update(pushSubscription).set({ failureCount: sql`least(${pushSubscription.failureCount} + 1, 32000)` }).where(eq(pushSubscription.id, device.id));
        }
      } catch {
        // The push itself went (or not); a bookkeeping failure must not fail the caller.
      }
    }),
  );
  return report;
}

/** Deletes the caller's own subscription for `endpoint`; another admin's is never touched (S-196 AC10). */
export async function removeOwnSubscription(db: Executor, adminId: string, endpoint: string): Promise<boolean> {
  const removed = await db
    .delete(pushSubscription)
    .where(and(eq(pushSubscription.adminId, adminId), eq(pushSubscription.endpoint, endpoint)))
    .returning({ id: pushSubscription.id });
  return removed.length > 0;
}
