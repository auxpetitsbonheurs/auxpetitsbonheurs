// Adds the Hyperdrive binding to the built Worker config just before `wrangler deploy`
// (ADR-0003). The Hyperdrive id is a GitHub repository variable (not a secret) that the deploy
// workflow passes as HYPERDRIVE_ID, so wrangler.jsonc stays free of account-specific ids.
// Empty or unset: prints a notice and leaves the build alone; the Worker then uses DATABASE_URL.
// Usage (after check-deploy): HYPERDRIVE_ID=<id> node scripts/inject-hyperdrive.ts <staging|production>
// Runs with Node's built-in TypeScript type stripping (Node >= 22.18).
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { type BuiltWorkerConfig, describeHyperdriveConfig, hyperdriveBinding, parseDeployTarget } from "../app/lib/deploy-guard.ts";

const target = parseDeployTarget(process.argv[2]);
const variable = `${target.toUpperCase()}_HYPERDRIVE_ID`;
let result: ReturnType<typeof hyperdriveBinding>;
try {
  result = hyperdriveBinding(process.env.HYPERDRIVE_ID);
} catch (error) {
  console.error(`::error::${variable}: ${error instanceof Error ? error.message : "invalid"}`);
  process.exit(1);
}

if (result.skip) {
  console.log(`::notice::No Hyperdrive id (${variable} empty, or this deploy did not ask for Hyperdrive): deploying without it (the Worker uses its DATABASE_URL secret). See ADR-0003.`);
  process.exit(0);
}

const configPath = resolve("build/server/wrangler.json");
const config = JSON.parse(readFileSync(configPath, "utf8")) as BuiltWorkerConfig;
config.hyperdrive = [result.binding];
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Hyperdrive binding ${result.binding.binding} added for ${target}`);

/**
 * Reports the configuration's origin kind, port and caching (never host, user or database;
 * ADR-0003 amendment 3). Informational: a missing permission or a network error only says so.
 */
async function reportConfig(id: string): Promise<void> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) return;
  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/hyperdrive/configs/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.log(`::notice::Hyperdrive configuration not readable with this API token (HTTP ${response.status}); origin and caching not checked.`);
      return;
    }
    const report = describeHyperdriveConfig(((await response.json()) as { result?: unknown }).result);
    console.log(`Hyperdrive origin: ${report.origin}, port ${report.port ?? "?"}; query caching ${report.caching}`);
    for (const warning of report.warnings) console.log(`::warning::${warning}`);
  } catch (error) {
    console.log(`::notice::Hyperdrive configuration check skipped (${error instanceof Error ? error.name : "error"}).`);
  }
}

await reportConfig(result.binding.id);
