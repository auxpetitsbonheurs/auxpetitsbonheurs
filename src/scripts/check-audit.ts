// CI dependency audit (G-18): `npm audit` for all dependencies and for runtime ones only, then the
// rules in app/lib/audit-gate.ts. Exits 1 with one line per problem.
// Usage: node scripts/check-audit.ts
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { type AuditException, auditProblems } from "../app/lib/audit-gate.ts";

function audit(args: string[]): object {
  try {
    return JSON.parse(execFileSync("npm", ["audit", "--json", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })) as object;
  } catch (error) {
    // npm audit exits non-zero when it finds anything; its JSON is still on stdout.
    const stdout = (error as { stdout?: string }).stdout;
    if (!stdout) throw error;
    return JSON.parse(stdout) as object;
  }
}

const exceptions = JSON.parse(readFileSync(new URL("../audit-exceptions.json", import.meta.url), "utf8")) as AuditException[];
const today = new Date().toISOString().slice(0, 10);
const problems = auditProblems(audit([]), audit(["--omit=dev"]), exceptions, today);

for (const problem of problems) console.log(`::error::npm audit: ${problem}`);
for (const e of exceptions) console.log(`Excepted until ${e.expires}: ${e.advisory} (${e.reason})`);
process.exit(problems.length > 0 ? 1 : 0);
