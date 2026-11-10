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

function endOfString(text: string, start: number): number {
  let i = start + 1;
  while (i < text.length && text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
  return i + 1;
}
