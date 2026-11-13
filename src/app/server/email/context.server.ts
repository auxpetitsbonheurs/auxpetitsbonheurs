// Request context for email (S-024) and background work. workers/app.ts fills them from
// the validated env: no Resend key or no hook secret means `null`, and the feature that
// needs it degrades with a log line (ADR-0002 amendment: integrations are optional).
import { createContext } from "react-router";
import { EMAIL_TIMEOUT_MS, type Mailer } from "./sender.server";

export interface EmailConfig {
  /** Resend sender; null while RESEND_API_KEY / EMAIL_FROM are not set. */
  mailer: Mailer | null;
  /** SUPABASE_AUTH_HOOK_SECRET (`v1,whsec_…`); null while not set. */
  hookSecret: string | null;
  /** Provider deadline; tests shorten it. */
  timeoutMs: number;
  /** SITE_URL origin; null while not set (the hook then falls back to the request's own origin). */
  siteUrl?: string | null;
}

export const emailContext = createContext<EmailConfig>({ mailer: null, hookSecret: null, timeoutMs: EMAIL_TIMEOUT_MS });

/** The Worker's `waitUntil`: work that may finish after the response (null in unit tests: awaited instead). */
export interface Background {
  waitUntil(promise: Promise<unknown>): void;
}

export const backgroundContext = createContext<Background | null>(null);

/** Runs `task` after the response when the Worker allows it, else waits for it. Never throws. */
export async function inBackground(context: { get: (key: typeof backgroundContext) => Background | null }, task: () => Promise<void>): Promise<void> {
  const safe = () => task().catch(() => undefined);
  const background = context.get(backgroundContext);
  if (background) background.waitUntil(safe());
  else await safe();
}
