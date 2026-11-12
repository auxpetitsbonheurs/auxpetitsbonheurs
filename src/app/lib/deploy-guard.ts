// Deploy guard: checks the Worker config that `react-router build` wrote
// (build/server/wrangler.json) before `wrangler deploy` ships it. Used by
// scripts/check-deploy.ts in the deploy scripts and the deploy workflow.
// Messages name variables, never their values.

export type DeployTarget = "staging" | "production";

export interface BuiltWorkerConfig {
  name?: string;
  /** Set by the Cloudflare Vite plugin from CLOUDFLARE_ENV at build time; absent for a top-level build. */
  targetEnvironment?: string;
  vars?: Record<string, unknown>;
  /** Added at deploy time by scripts/inject-hyperdrive.ts when the Hyperdrive id variable is set. */
  hyperdrive?: { binding: string; id: string }[];
}

/** Plain (non-secret) vars a deployed Worker may carry; every other binding is a `wrangler secret`. */
const PLAIN_VARS = new Set(["APP_ENV", "APP_TIME_ZONE"]);
const LOCAL_HOST = /\b(localhost|127\.0\.0\.1|\[::1\])\b/;

export function parseDeployTarget(value: string | undefined): DeployTarget {
  if (value === "staging" || value === "production") return value;
  throw new Error("Deploy target must be staging or production");
}

export function deployProblems(config: BuiltWorkerConfig, target: DeployTarget): string[] {
  const problems: string[] = [];
  const built = config.targetEnvironment;
  if (built !== target) {
    const what = built ? `"${built}"` : "the top-level (development) configuration";
    problems.push(`Build was built for ${what}, not "${target}": rebuild with CLOUDFLARE_ENV=${target} npm run build`);
  }
  const vars = config.vars ?? {};
  if (vars.APP_ENV !== target) {
    problems.push(`APP_ENV is ${JSON.stringify(typeof vars.APP_ENV === "string" ? vars.APP_ENV : null)}, expected "${target}"`);
  }
  for (const [name, value] of Object.entries(vars)) {
    if (name === "TEST_CLOCK") problems.push("TEST_CLOCK is set: test-only switches never ship");
    else if (!PLAIN_VARS.has(name)) problems.push(`${name} is a plain var: set it with wrangler secret put ${name} --env ${target}`);
    if (typeof value === "string" && LOCAL_HOST.test(value)) problems.push(`${name} points at a local address`);
  }
  return problems;
}

export type HyperdriveBinding = { skip: true } | { skip: false; binding: { binding: "HYPERDRIVE"; id: string } };

/**
 * The Hyperdrive id arrives from a GitHub variable (not a secret). Empty means "not created
 * yet": skip. A malformed value is refused without echoing it (a pasted connection string
 * would carry a password).
 */
export function hyperdriveBinding(id: string | undefined): HyperdriveBinding {
  const value = (id ?? "").trim();
  if (value === "") return { skip: true };
  if (!/^[0-9a-f]{32}$/i.test(value)) {
    throw new Error("The Hyperdrive id must be 32 hex characters (Cloudflare dashboard > Hyperdrive > the configuration's ID)");
  }
  return { skip: false, binding: { binding: "HYPERDRIVE", id: value } };
}

/** Parses JSON with comments (wrangler.jsonc): drops // and /* *\/ comments outside strings. */
export function readJsonc(text: string): unknown {
  let out = "";
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if (char === '"') {
      const end = endOfString(text, i);
      out += text.slice(i, end);
      i = end - 1;
    } else if (char === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i += 1;
      out += "\n";
    } else if (char === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i + 2) + 1;
    } else {
      out += char;
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

export interface HyperdriveReport {
  origin: "Supabase direct" | "Supabase session pooler" | "Supabase transaction pooler" | "other";
  port: number | null;
  caching: "on" | "off" | "unknown";
  /** What the Owner should change, if anything (minimum steps). */
  warnings: string[];
}

/**
 * Classifies a Hyperdrive configuration (Cloudflare API `GET .../hyperdrive/configs/:id`
 * result) without echoing it: host, user and database never leave this function, only the
 * kind of origin, its port and whether query caching is on (ADR-0003 amendment 3).
 */
export function describeHyperdriveConfig(config: unknown): HyperdriveReport {
  const value = (config ?? {}) as { origin?: { host?: unknown; port?: unknown }; caching?: { disabled?: unknown } };
  const host = typeof value.origin?.host === "string" ? value.origin.host.toLowerCase() : "";
  const port = typeof value.origin?.port === "number" ? value.origin.port : null;
  const pooler = host.endsWith(".pooler.supabase.com");
  const origin: HyperdriveReport["origin"] = /^db\.[a-z0-9]+\.supabase\.co$/.test(host)
    ? "Supabase direct"
    : pooler && port === 6543
      ? "Supabase transaction pooler"
      : pooler
        ? "Supabase session pooler"
        : "other";
  const disabled = value.caching?.disabled;
  const caching = disabled === true ? "off" : disabled === false || value.caching === undefined ? "on" : "unknown";
  const warnings: string[] = [];
  if (origin === "Supabase transaction pooler") {
    warnings.push("Hyperdrive points at Supabase's transaction pooler (port 6543). Cloudflare dashboard > Hyperdrive > this configuration > Settings > Origin: paste Supabase's Session pooler (port 5432) or Direct connection string.");
  }
  if (caching === "on") {
    warnings.push("Hyperdrive query caching is on: pages could show data up to a minute old (an approved order still pending). Cloudflare dashboard > Hyperdrive > this configuration > Settings > Caching: turn it off.");
  }
  return { origin, port, caching, warnings };
}

function endOfString(text: string, start: number): number {
  let i = start + 1;
  while (i < text.length && text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
  return i + 1;
}
