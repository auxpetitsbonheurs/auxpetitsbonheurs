// S-020 AC5, AC6: the weekly backup workflow (.github/workflows/backup.yml), read as text.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const workflow = readFileSync(fileURLToPath(new URL("../../../.github/workflows/backup.yml", import.meta.url)), "utf8");
const at = (text: string) => {
  const index = workflow.indexOf(text);
  expect(index, text).toBeGreaterThanOrEqual(0);
  return index;
};

describe("backup workflow schedule (AC5)", () => {
  test("runs Sunday 02:00 Mauritius time (Saturday 22:00 UTC) and by manual dispatch", () => {
    expect(workflow).toMatch(/schedule:\s*\n\s+- cron: "0 22 \* \* 6"/);
    expect(workflow).toMatch(/^\s{2}workflow_dispatch:/m);
  });
});

describe("backup workflow steps (AC5)", () => {
  test("dump, copy both buckets, encrypt, upload, keep the latest 8, in that order", () => {
    const order = [
      at("pg_dump --format=custom"),
      at("rclone copy supabase:public-images"),
      at("rclone copy supabase:request-photos"),
      at('age --encrypt --recipient "$AGE_RECIPIENT"'),
      at("rclone copy \"$ARCHIVE\" gdrive:"),
      at("head -n -8"),
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test("the plain dump and bucket copies never leave the runner unencrypted", () => {
    const uploads = [...workflow.matchAll(/rclone (copy|copyto|move|sync) [^\n]* gdrive:/g)].map((m) => m[0]);
    expect(uploads).toEqual(['rclone copy "$ARCHIVE" gdrive:']);
    expect(workflow).toMatch(/ARCHIVE=.*\.tar\.age/);
  });
});

describe("backup workflow secrets (AC6)", () => {
  const names = [...new Set([...workflow.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]!))];

  test("checks every required secret first and fails naming the missing one", () => {
    expect(at("scripts/check-keys.sh --require")).toBeLessThan(at("pg_dump --format=custom"));
    for (const name of names.filter((n) => n !== "BACKUP_RESEND_API_KEY" && n !== "BACKUP_NOTIFY_EMAIL")) {
      expect(workflow.slice(at("scripts/check-keys.sh --require")).split("\n")[0]).toContain(name);
    }
  });

  test("a failure step emails the bakery address", () => {
    expect(workflow).toMatch(/if: failure\(\)/);
    expect(workflow.slice(at("if: failure()"))).toContain("https://api.resend.com/emails");
    expect(names).toEqual(expect.arrayContaining(["BACKUP_RESEND_API_KEY", "BACKUP_NOTIFY_EMAIL"]));
  });

  test("secrets are referenced by name only and nothing is allowed to fail quietly", () => {
    expect(workflow).not.toMatch(/(postgres(ql)?:\/\/|re_[A-Za-z0-9]{8,}|AGE-SECRET-KEY|age1[a-z0-9]{20,})/);
    expect(workflow).not.toMatch(/continue-on-error:\s*true/);
    expect(workflow).not.toMatch(/\|\|\s*true/);
  });
});

describe("scripts/check-keys.sh --require (AC6: never a silent success)", () => {
  const script = fileURLToPath(new URL("../../scripts/check-keys.sh", import.meta.url));
  const run = (env: Record<string, string>) => {
    const output = join(mkdtempSync(join(tmpdir(), "keys-")), "github-output");
    writeFileSync(output, "");
    const result = spawnSync("bash", [script, "--require", "SUPABASE_DB_URL", "AGE_RECIPIENT"], {
      // Cast: worker typegen adds required keys to ProcessEnv; the script needs only these.
      env: { PATH: process.env.PATH ?? "", GITHUB_OUTPUT: output, ...env } as unknown as NodeJS.ProcessEnv,
      encoding: "utf8",
    });
    return { status: result.status, out: result.stdout + result.stderr + readFileSync(output, "utf8") };
  };

  test("fails when nothing is configured, naming every missing secret", () => {
    const { status, out } = run({});
    expect(status).toBe(1);
    expect(out).toMatch(/::error::.*SUPABASE_DB_URL AGE_RECIPIENT/);
  });

  test("passes when all are set, without printing values", () => {
    const { status, out } = run({ SUPABASE_DB_URL: "pg-value-xyz", AGE_RECIPIENT: "age-value" });
    expect(status).toBe(0);
    expect(out).toContain("configured=true");
    expect(out).not.toContain("pg-value-xyz");
  });
});
