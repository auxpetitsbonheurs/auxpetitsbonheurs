// Turns on Web Push for one deployed site (S-196 AC8): generates a VAPID key pair and stores it,
// with the contact subject, as the Worker secrets VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and
// VAPID_SUBJECT. Each value goes to `wrangler secret put` on stdin: the private key is never
// printed, logged or written to disk. Only the public key (public by design) is printed.
// Needs Cloudflare credentials as for deploys (CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID, or
// `wrangler login`). Run by the `vapid-keys` workflow, or locally:
//   cd src && node scripts/set-vapid-keys.ts staging mailto:owner@example.com
// Refuses to replace existing keys unless --rotate: new keys make every subscribed phone stop
// receiving until each admin taps "Enable push on this device" again.
import { execFileSync } from "node:child_process";
import { parseSecretList } from "../app/lib/integrations.ts";
import { parseDeployTarget } from "../app/lib/deploy-guard.ts";
import { generateVapidKeys } from "../app/server/push/web-push.server.ts";

const target = parseDeployTarget(process.argv[2]);
const subject = (process.argv[3] ?? process.env.VAPID_SUBJECT_INPUT ?? "").trim();
const rotate = process.argv.includes("--rotate");

if (!/^(mailto:[^\s@]+@[^\s@]+\.[^\s@]+|https:\/\/\S+)$/.test(subject)) {
  console.error("Give a contact for the push services: mailto:you@example.com or an https:// address.");
  process.exit(1);
}

const wrangler = (args: string[], input?: string) =>
  execFileSync("npx", ["wrangler", ...args, "--env", target], { input, encoding: "utf8", stdio: [input === undefined ? "ignore" : "pipe", "pipe", "ignore"] });

const existing = parseSecretList(wrangler(["secret", "list", "--format", "json"]));
if (existing.includes("VAPID_PRIVATE_KEY") && !rotate) {
  console.log(`${target}: push keys are already set; nothing changed (add --rotate to replace them).`);
  process.exit(0);
}

const keys = await generateVapidKeys();
for (const [name, value] of [["VAPID_SUBJECT", subject], ["VAPID_PUBLIC_KEY", keys.publicKey], ["VAPID_PRIVATE_KEY", keys.privateKey]] as const) {
  wrangler(["secret", "put", name], value);
  console.log(`${target}: ${name} set.`);
}
console.log(`${target}: push is on. Public key (safe to share): ${keys.publicKey}`);
