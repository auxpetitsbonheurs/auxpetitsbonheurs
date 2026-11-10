// Validated Worker bindings and secrets (NFR-012, NFR-008). Parse once per isolate
// with `getEnv(env)`; a bad deploy fails on the first request with the variable's
// name, never its value. Every key is listed in .dev.vars.example.
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
  /** Supavisor transaction pooler (port 6543). */
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
});

/** Needed by later features; optional in development, required in staging and production. */
const integrationSchema = z.object({
  RESEND_API_KEY: required,
  EMAIL_FROM: required,
  VAPID_PUBLIC_KEY: required,
  VAPID_PRIVATE_KEY: required,
  VAPID_SUBJECT: required,
  SUPABASE_AUTH_HOOK_SECRET: required,
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
const deployedSchema = coreSchema
  .extend(integrationSchema.shape)
  .extend({ TEST_CLOCK: z.never().optional() });

export type ServerEnv = z.infer<typeof developmentSchema>;

/** Every deployable variable (listed in .dev.vars.example); test-only switches excluded. */
export const ENV_KEYS: readonly string[] = Object.keys(coreSchema.extend(integrationSchema.shape).shape);

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
    if (result.data.TEST_CLOCK === "on" && !isLocalDatabase(result.data.DATABASE_URL)) {
      throw new EnvError(["DATABASE_URL"]);
    }
    return result.data;
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
