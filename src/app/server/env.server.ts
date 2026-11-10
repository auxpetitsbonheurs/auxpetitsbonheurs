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

const developmentSchema = coreSchema.extend(integrationSchema.partial().shape);
const deployedSchema = coreSchema.extend(integrationSchema.shape);

export type ServerEnv = z.infer<typeof developmentSchema>;

export const ENV_KEYS: readonly string[] = Object.keys(deployedSchema.shape);

export class EnvError extends Error {
  readonly variables: string[];

  constructor(variables: string[]) {
    super(`Invalid or missing environment variables: ${variables.join(", ")}`);
    this.name = "EnvError";
    this.variables = variables;
  }
}

export function parseEnv(bindings: Record<string, unknown>): ServerEnv {
  const appEnv = coreSchema.shape.APP_ENV.safeParse(bindings.APP_ENV);
  const schema = appEnv.success && appEnv.data === "development" ? developmentSchema : deployedSchema;
  const result = schema.safeParse(bindings, { reportInput: false });
  if (result.success) return result.data;
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
