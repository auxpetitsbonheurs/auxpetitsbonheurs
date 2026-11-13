// Validated Worker bindings and secrets (NFR-012, NFR-008). Parse once per isolate
// with `getEnv(env)`; a bad deploy fails on the first request with the variable's
// name, never its value. Every key is listed in .dev.vars.example.
// Only the four core secrets are required everywhere; integration keys are optional at
// startup (ADR-0002 amendment): the feature that needs one checks `integrationConfigured`
// (~/lib/integrations) and degrades with a log line naming the missing keys.
import { z } from "zod";

const required = z.string().min(1);
const url = z.url();

const coreSchema = z.object({
  APP_ENV: z.enum(["development", "staging", "production"]),
  /** Business time zone is fixed (NFR-008); anything else is a misconfiguration. */
  APP_TIME_ZONE: z.literal("Indian/Mauritius"),
  SUPABASE_URL: url,
  SUPABASE_ANON_KEY: required,
  SUPABASE_SERVICE_ROLE_KEY: required,
  /**
   * Fallback database URL (Supavisor transaction pooler, port 6543): used when there is no
   * Hyperdrive binding (local dev, e2e, a deploy before the Hyperdrive id exists).
   */
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }).optional(),
  /** Cloudflare Hyperdrive binding (ADR-0003); present only when the deploy injected its id. */
  HYPERDRIVE: z.object({ connectionString: z.url({ protocol: /^postgres(ql)?$/ }) }).optional(),
});

/**
 * Optional in every environment; validated only when set. Launch readiness (production
 * deploy summary, scripts/launch-readiness.ts) names the missing ones.
 */
const integrationSchema = z.object({
  RESEND_API_KEY: required,
  EMAIL_FROM: required,
  VAPID_PUBLIC_KEY: required,
  VAPID_PRIVATE_KEY: required,
  VAPID_SUBJECT: required,
  SUPABASE_AUTH_HOOK_SECRET: required,
  TURNSTILE_SITE_KEY: required,
  TURNSTILE_SECRET_KEY: required,
  SENTRY_DSN: url,
});

/**
 * Test-only switches (S-005). `TEST_CLOCK=on` lets e2e specs set "now" per browser
 * context; only development may set it, so staging and production refuse to start.
 */
const developmentOnlySchema = z.object({ TEST_CLOCK: z.literal("on").optional() });

const developmentSchema = coreSchema
  .extend(integrationSchema.partial().shape)
  .extend(developmentOnlySchema.shape);
/** Deployed Workers never talk to a local Supabase (http): that is an e2e/dev build shipped by mistake. */
const deployedSchema = coreSchema
  .extend(integrationSchema.partial().shape)
  .extend({ SUPABASE_URL: z.url({ protocol: /^https$/ }), TEST_CLOCK: z.never().optional() });

/** `DATABASE_URL` is always set here: the Hyperdrive connection string when bound, else the secret. */
export type ServerEnv = Omit<z.infer<typeof developmentSchema>, "DATABASE_URL" | "HYPERDRIVE"> & { DATABASE_URL: string };

/** Every deployable variable (listed in .dev.vars.example); test-only switches and bindings excluded. */
export const ENV_KEYS: readonly string[] = Object.keys(coreSchema.extend(integrationSchema.shape).shape).filter((key) => key !== "HYPERDRIVE");

export class EnvError extends Error {
  readonly variables: string[];

  constructor(variables: string[]) {
    super(`Invalid or missing environment variables: ${variables.join(", ")}`);
    this.name = "EnvError";
    this.variables = variables;
  }
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Test mode (TEST_CLOCK) must never reach a shared database. */
function isLocalDatabase(databaseUrl: string): boolean {
  return LOCAL_HOSTS.has(new URL(databaseUrl).hostname);
}

export function parseEnv(bindings: Record<string, unknown>): ServerEnv {
  const appEnv = coreSchema.shape.APP_ENV.safeParse(bindings.APP_ENV);
  const schema = appEnv.success && appEnv.data === "development" ? developmentSchema : deployedSchema;
  const result = schema.safeParse(bindings, { reportInput: false });
  if (result.success) {
    const { HYPERDRIVE, DATABASE_URL: fallback, ...rest } = result.data;
    const DATABASE_URL = HYPERDRIVE?.connectionString ?? fallback;
    if (!DATABASE_URL) throw new EnvError(["DATABASE_URL"]);
    if (rest.TEST_CLOCK === "on" && !isLocalDatabase(DATABASE_URL)) throw new EnvError(["DATABASE_URL"]);
    return { ...rest, DATABASE_URL };
  }
  // Only the names leave this function: zod issues are dropped, not attached as `cause`.
  const names = result.error.issues.map((issue) => String(issue.path[0]));
  throw new EnvError([...new Set(names)]);
}

const cache = new WeakMap<object, ServerEnv>();

/** Parses the bindings once per isolate. */
export function getEnv(bindings: object): ServerEnv {
  let env = cache.get(bindings);
  if (!env) {
    env = parseEnv(bindings as Record<string, unknown>);
    cache.set(bindings, env);
  }
  return env;
}
