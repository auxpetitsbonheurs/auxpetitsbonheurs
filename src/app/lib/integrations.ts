// Core runtime secrets vs optional integrations (ADR-0002 amendment, 2026-11-10).
// A Worker starts with the core four; each integration is optional at startup and the feature
// that needs it degrades safely and visibly (a log line naming the missing keys) when absent.
// Launch readiness lists what is still missing, by NAME only: values never pass through here.
// Pure and dependency-free: imported by env.server.ts and run by Node type stripping in
// scripts/launch-readiness.ts (keep to erasable TypeScript).

/** Without these the Worker refuses to start (env.server.ts). */
export const CORE_SECRETS = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "DATABASE_URL"] as const;

export type IntegrationName = "email" | "push" | "authEmailHook" | "turnstile" | "sentry";

export interface Integration {
  name: IntegrationName;
  keys: readonly string[];
  /** Must be configured before the public launch of production. */
  launchBlocker: boolean;
  /** What happens while it is missing (shown to the Owner and logged). */
  whenMissing: string;
}

export const INTEGRATIONS: readonly Integration[] = [
  {
    name: "email",
    keys: ["RESEND_API_KEY", "EMAIL_FROM"],
    launchBlocker: true,
    whenMissing: "order emails stay queued in the outbox; nothing is sent",
  },
  {
    name: "push",
    keys: ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"],
    launchBlocker: false,
    whenMissing: "no phone notifications to admins",
  },
  {
    name: "authEmailHook",
    keys: ["SUPABASE_AUTH_HOOK_SECRET"],
    launchBlocker: false,
    whenMissing: "keep the Supabase Send Email hook disabled; Supabase sends its default auth emails",
  },
  {
    name: "turnstile",
    keys: ["TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"],
    launchBlocker: true,
    whenMissing: "public forms have no bot protection",
  },
  {
    name: "sentry",
    keys: ["SENTRY_DSN"],
    launchBlocker: false,
    whenMissing: "errors are only in Cloudflare Workers Logs",
  },
];

/** Every optional key, in INTEGRATIONS order. */
export const INTEGRATION_KEYS: readonly string[] = INTEGRATIONS.flatMap((integration) => integration.keys);

const isSet = (value: unknown) => typeof value === "string" && value.length > 0;

/** Names of the keys of `name` that are not set in `env` (empty when the integration is usable). */
export function missingKeys(env: Record<string, unknown>, name: IntegrationName): string[] {
  const integration = INTEGRATIONS.find((candidate) => candidate.name === name);
  return (integration?.keys ?? []).filter((key) => !isSet(env[key]));
}

/** A feature calls this before using its integration and no-ops (with a log line) when false. */
export function integrationConfigured(env: Record<string, unknown>, name: IntegrationName): boolean {
  return missingKeys(env, name).length === 0;
}

export interface MissingIntegration {
  name: IntegrationName;
  keys: string[];
  launchBlocker: boolean;
  whenMissing: string;
}

export interface ReadinessReport {
  /** Core secrets that are not set: the site cannot start. */
  missingCore: string[];
  missing: MissingIntegration[];
  /** Nothing core missing and no launch-blocking integration missing. */
  launchReady: boolean;
}

/** Readiness from the NAMES of the secrets a Worker has (e.g. `wrangler secret list`). */
export function launchReadiness(present: Iterable<string>): ReadinessReport {
  const names = new Set(present);
  const missingCore = CORE_SECRETS.filter((key) => !names.has(key));
  const missing = INTEGRATIONS.map((integration) => ({
    name: integration.name,
    keys: integration.keys.filter((key) => !names.has(key)),
    launchBlocker: integration.launchBlocker,
    whenMissing: integration.whenMissing,
  })).filter((integration) => integration.keys.length > 0);
  const launchReady = missingCore.length === 0 && !missing.some((integration) => integration.launchBlocker);
  return { missingCore, missing, launchReady };
}

/** Secret names from `wrangler secret list --format json` output (`[{ "name": …, "type": … }]`). */
export function parseSecretList(stdout: string): string[] {
  // Banner lines such as "▲ [WARNING] …" also contain "[": the list starts at "[{" or "[]".
  const start = stdout.search(/\[\s*(\{|\])/);
  const end = stdout.lastIndexOf("]");
  if (start < 0 || end < start) throw new Error("wrangler secret list printed no JSON list");
  const list: unknown = JSON.parse(stdout.slice(start, end + 1));
  if (!Array.isArray(list)) throw new Error("wrangler secret list printed no JSON list");
  return list.flatMap((entry: unknown) =>
    entry && typeof entry === "object" && typeof (entry as { name?: unknown }).name === "string" ? [(entry as { name: string }).name] : [],
  );
}

export type Target = "staging" | "production";

/** GitHub Actions annotation lines (names only). Production warns; staging only notes. */
export function readinessAnnotations(report: ReadinessReport, target: Target): string[] {
  const lines: string[] = [];
  const level = target === "production" ? "warning" : "notice";
  if (report.missingCore.length > 0) {
    lines.push(`::warning::${target}: missing core secrets ${report.missingCore.join(", ")}: the site shows an error page until they are set (docs/runbooks/deploy-keys.md section 2).`);
  }
  for (const integration of report.missing) {
    lines.push(`::${level}::${target}: ${integration.name} not configured (${integration.keys.join(", ")}): ${integration.whenMissing}.`);
  }
  if (target === "production" && !report.launchReady) {
    const blockers = [...report.missingCore, ...report.missing.filter((i) => i.launchBlocker).flatMap((i) => i.keys)];
    lines.push(`::warning::production is NOT ready for public launch: set ${blockers.join(", ")} first.`);
  }
  if (lines.length === 0) lines.push(`${target}: all core secrets and integrations are configured.`);
  return lines;
}
