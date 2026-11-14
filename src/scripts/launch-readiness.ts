// Launch readiness (ADR-0002 amendment): which core secrets and optional integrations the
// deployed Worker of <staging|production> still lacks, by NAME only. Reads the names with
// `wrangler secret list` (needs CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID, as in deploy.yml);
// values are never requested or printed. Prints GitHub Actions annotations and, in Actions,
// a step summary. Exit 0 (warn only) unless --strict, which fails when not launch ready.
// Usage: node scripts/launch-readiness.ts <staging|production> [--strict]
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { launchReadiness, parseSecretList, readinessAnnotations } from "../app/lib/integrations.ts";
import { parseDeployTarget, readJsonc } from "../app/lib/deploy-guard.ts";

const target = parseDeployTarget(process.argv[2]);
const strict = process.argv.includes("--strict");

let names: string[];
try {
  const stdout = execFileSync("npx", ["wrangler", "secret", "list", "--env", target, "--format", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  names = parseSecretList(stdout);
} catch {
  console.log(`::warning::Launch readiness for ${target}: could not list the Worker's secrets (is it deployed, and are the Cloudflare secrets set?).`);
  process.exit(strict ? 1 : 0);
}

// Plain vars deploy with the Worker from wrangler.jsonc (EMAIL_FROM, SITE_URL), not as secrets.
const wrangler = readJsonc(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8")) as { env?: Record<string, { vars?: Record<string, unknown> }> };
const plainVars = Object.keys(wrangler.env?.[target]?.vars ?? {});
const report = launchReadiness([...names, ...plainVars]);
const lines = readinessAnnotations(report, target);
for (const line of lines) console.log(line);

const summaryFile = process.env.GITHUB_STEP_SUMMARY;
if (summaryFile) {
  const rows = report.missing.map((i) => `| ${i.name} | ${i.keys.join(", ")} | ${i.launchBlocker ? "yes" : "no"} | ${i.whenMissing} |`);
  const summary = [
    `### Launch readiness: ${target} ${report.launchReady ? "(ready)" : "(not ready for public launch)"}`,
    report.missingCore.length > 0 ? `Missing core secrets (site cannot start): ${report.missingCore.join(", ")}` : "Core secrets: all set.",
    ...(rows.length > 0 ? ["", "| Integration | Missing | Blocks launch | Meanwhile |", "|---|---|---|---|", ...rows] : []),
    "",
    "Where each key comes from: docs/runbooks/deploy-keys.md section 2.",
    "",
  ].join("\n");
  appendFileSync(summaryFile, summary);
}

process.exit(strict && !report.launchReady ? 1 : 0);
