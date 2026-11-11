// Adds the Hyperdrive binding to the built Worker config just before `wrangler deploy`
// (ADR-0003). The Hyperdrive id is a GitHub repository variable (not a secret) that the deploy
// workflow passes as HYPERDRIVE_ID, so wrangler.jsonc stays free of account-specific ids.
// Empty or unset: prints a notice and leaves the build alone; the Worker then uses DATABASE_URL.
// Usage (after check-deploy): HYPERDRIVE_ID=<id> node scripts/inject-hyperdrive.ts <staging|production>
// Runs with Node's built-in TypeScript type stripping (Node >= 22.18).
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { type BuiltWorkerConfig, hyperdriveBinding, parseDeployTarget } from "../app/lib/deploy-guard.ts";

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
  console.log(`::notice::${variable} is not set: deploying without Hyperdrive (the Worker uses its DATABASE_URL secret). See docs/runbooks/deploy-keys.md.`);
  process.exit(0);
}

const configPath = resolve("build/server/wrangler.json");
const config = JSON.parse(readFileSync(configPath, "utf8")) as BuiltWorkerConfig;
config.hyperdrive = [result.binding];
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Hyperdrive binding ${result.binding.binding} added for ${target}`);
