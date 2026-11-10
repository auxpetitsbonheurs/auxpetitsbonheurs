// Fails when any route's initial JS (gzipped) exceeds project.yaml budgets.js_initial_kb.
// Usage (after `npm run build`): npm run check:js-budget [-- --project ../project.yaml]
// Runs with Node's built-in TypeScript type stripping (Node >= 22.18).
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import {
  type RouteManifest,
  checkBudgets,
  readBudgetKb,
  routeInitialChunks,
} from "../app/lib/js-budget.ts";

const clientDir = resolve("build/client");
const projectFlag = process.argv.indexOf("--project");
const projectPath = resolve(projectFlag > 0 ? (process.argv[projectFlag + 1] ?? "") : "../project.yaml");

function readManifest(): RouteManifest {
  const file = readdirSync(join(clientDir, "assets")).find((f) => /^manifest-.*\.js$/.test(f));
  if (!file) throw new Error("No React Router manifest in build/client/assets; run `npm run build` first");
  const source = readFileSync(join(clientDir, "assets", file), "utf8");
  const json = source.slice(source.indexOf("=") + 1).replace(/;\s*$/, "");
  return JSON.parse(json) as RouteManifest;
}

function gzipSize(chunk: string): number {
  return gzipSync(readFileSync(join(clientDir, chunk))).length;
}

const limitKb = readBudgetKb(readFileSync(projectPath, "utf8"));
const sizes = routeInitialChunks(readManifest()).map(({ route, chunks }) => ({
  route,
  gzipBytes: chunks.reduce((sum, chunk) => sum + gzipSize(chunk), 0),
}));
const result = checkBudgets(sizes, limitKb);

console.log(result.report);
if (!result.ok) {
  console.error(`JS budget exceeded on ${result.failures.length} route(s); limit ${limitKb} kB.`);
  process.exit(1);
}
