// Refuses to deploy a build that was not made for the target environment (top-level/development
// or e2e config, TEST_CLOCK, local addresses, secrets in plain vars).
// Usage (after `CLOUDFLARE_ENV=<env> npm run build`): node scripts/check-deploy.ts <staging|production>
// Runs with Node's built-in TypeScript type stripping (Node >= 22.18).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type BuiltWorkerConfig, deployProblems, parseDeployTarget } from "../app/lib/deploy-guard.ts";

const target = parseDeployTarget(process.argv[2]);
const configPath = resolve("build/server/wrangler.json");
let config: BuiltWorkerConfig;
try {
  config = JSON.parse(readFileSync(configPath, "utf8")) as BuiltWorkerConfig;
} catch {
  console.error(`No build found at ${configPath}: run CLOUDFLARE_ENV=${target} npm run build first`);
  process.exit(1);
}

const problems = deployProblems(config, target);
if (problems.length > 0) {
  console.error(`Refusing to deploy to ${target}:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(`Deploy check passed: build is for ${target} (Worker ${config.name ?? "?"})`);
