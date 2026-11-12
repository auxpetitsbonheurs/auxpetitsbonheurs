// Client-bundle secret check (threat model G-19, J1): nothing the browser downloads may
// name a server secret or contain a secret's value. Pure; the CLI that reads build/client
// lives in scripts/check-client-secrets.ts. Reports file names and secret NAMES only.

/** Server-only variables (env.server.ts) whose name must never reach the browser. */
export const SERVER_SECRET_NAMES = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "DATABASE_URL",
  "HYPERDRIVE",
  "RESEND_API_KEY",
  "VAPID_PRIVATE_KEY",
  "SUPABASE_AUTH_HOOK_SECRET",
  "TURNSTILE_SECRET_KEY",
  "STAGING_DATABASE_URL",
  "PRODUCTION_DATABASE_URL",
  "STAGING_SUPABASE_SERVICE_ROLE_KEY",
  "CLOUDFLARE_API_TOKEN",
] as const;

/** Any other name shaped like a secret (`*_SECRET`, `*_SECRET_KEY`, `*_PRIVATE_KEY`, `*SERVICE_ROLE*`). */
const SECRET_SHAPED = /\b[A-Z][A-Z0-9_]*(?:_SECRET(?:_[A-Z0-9]+)?|_PRIVATE_KEY|SERVICE_ROLE[A-Z0-9_]*)\b/g;

/** Values shorter than this are not checked (too likely to match by chance). */
export const MIN_VALUE_LENGTH = 12;

export interface BundleFile {
  path: string;
  text: string;
}

export interface SecretFinding {
  file: string;
  /** The secret's name; for a value match, the name of the variable it came from. */
  name: string;
  kind: "name" | "value";
}

/**
 * Every place a server secret's name, or one of `values` (name -> value), appears in the
 * bundle. A value is never put in a finding, only the name it belongs to.
 */
export function findClientSecrets(files: readonly BundleFile[], values: Readonly<Record<string, string>> = {}): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const checkedValues = Object.entries(values).filter(([, value]) => value.length >= MIN_VALUE_LENGTH);
  for (const file of files) {
    const names = new Set<string>(SERVER_SECRET_NAMES.filter((name) => new RegExp(`\\b${name}\\b`).test(file.text)));
    for (const match of file.text.matchAll(SECRET_SHAPED)) names.add(match[0]);
    for (const name of names) findings.push({ file: file.path, name, kind: "name" });
    for (const [name, value] of checkedValues) if (file.text.includes(value)) findings.push({ file: file.path, name, kind: "value" });
  }
  return findings;
}

/** Secret-named entries (by name) of a wrangler.jsonc `vars` block or an env, for the value check. */
export function secretValues(source: Readonly<Record<string, unknown>>): Record<string, string> {
  const isSecretName = (name: string) => (SERVER_SECRET_NAMES as readonly string[]).includes(name) || new RegExp(`^${SECRET_SHAPED.source}$`).test(name);
  return Object.fromEntries(Object.entries(source).filter((e): e is [string, string] => typeof e[1] === "string" && isSecretName(e[0])));
}
