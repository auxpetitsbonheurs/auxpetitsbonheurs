// Fails when the browser bundle (build/client) names a server secret or holds a secret's value
// (threat model G-19). Values checked: the secret-named vars of every wrangler.jsonc env (the
// e2e placeholders) and any secret-named variable set in this process's environment (none in
// CI; a deploy job could pass its own). Prints file and secret NAMES only, never a value.
// Usage (after `npm run build`): npm run check:client-secrets
// Runs with Node's built-in TypeScript type stripping (Node >= 22.18).
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { type BundleFile, findClientSecrets, secretValues } from "../app/lib/client-secrets.ts";
import { readJsonc } from "../app/lib/deploy-guard.ts";

const clientDir = resolve("build/client");
const TEXT = /\.(m?js|css|html|json|map|txt|webmanifest|svg)$/;

function bundleFiles(dir: string): BundleFile[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return bundleFiles(path);
    return TEXT.test(entry.name) ? [{ path: relative(clientDir, path), text: readFileSync(path, "utf8") }] : [];
  });
}

type WranglerConfig = { vars?: Record<string, unknown>; env?: Record<string, { vars?: Record<string, unknown> }> };
const wrangler = readJsonc(readFileSync(resolve("wrangler.jsonc"), "utf8")) as WranglerConfig;
const values = {
  ...secretValues(wrangler.vars ?? {}),
  ...Object.assign({}, ...Object.values(wrangler.env ?? {}).map((env) => secretValues(env.vars ?? {}))),
  ...secretValues(process.env),
};

const files = bundleFiles(clientDir);
if (files.length === 0) {
  console.error("No files in build/client; run `npm run build` first.");
  process.exit(1);
}
const findings = findClientSecrets(files, values);
if (findings.length > 0) {
  for (const f of findings) console.error(`${f.file}: server secret ${f.kind === "name" ? "name" : "value of"} ${f.name}`);
  console.error(`Client bundle exposes server secrets (${findings.length}); keep them in app/server (*.server.ts).`);
  process.exit(1);
}
console.log(`Client bundle: ${files.length} files, no server secret names or values (${Object.keys(values).length} values checked).`);
