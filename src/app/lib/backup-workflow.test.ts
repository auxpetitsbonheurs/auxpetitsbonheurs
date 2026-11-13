// S-020 AC5, AC6: the weekly backup workflow (.github/workflows/backup.yml), read as text.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const workflow = readFileSync(fileURLToPath(new URL("../../../.github/workflows/backup.yml", import.meta.url)), "utf8");
const rehearsal = readFileSync(fileURLToPath(new URL("../../../.github/workflows/backup-rehearsal.yml", import.meta.url)), "utf8");
const dumpScript = readFileSync(fileURLToPath(new URL("../../scripts/backup-dump.sh", import.meta.url)), "utf8");
const verifyScript = fileURLToPath(new URL("../../scripts/backup-verify.sh", import.meta.url));
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
      at("src/scripts/backup-dump.sh backup"),
      at("rclone copy supabase:public-images"),
      at("rclone copy supabase:request-photos"),
      at('age --encrypt --recipient "$AGE_RECIPIENT"'),
      at("rclone copy \"$ARCHIVE\" gdrive:"),
      at("head -n -8"),
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test("pg_dump runs as the runner's user so it can write into the runner-owned backup folder", () => {
    const dockerRun = dumpScript.slice(dumpScript.indexOf("docker run"), dumpScript.indexOf("pg_dump --format=custom"));
    expect(dockerRun).toContain('--user "$(id -u):$(id -g)"');
  });

  test("S-232: the dump holds the app tables, the Auth accounts (data only) and the counts for the restore check", () => {
    expect(dumpScript).toContain("pg_dump --format=custom --no-owner --no-privileges --schema=public --schema=drizzle --file=/backup/database.dump");
    expect(dumpScript).toContain("pg_dump --format=custom --no-owner --no-privileges --data-only --schema=auth --file=/backup/auth.dump");
    expect(dumpScript).toContain("> /backup/counts.tsv");
    expect(dumpScript).toContain("postgres:17");
  });

  test("S-231 AC2: the run summary records sizes and photo counts", () => {
    const summary = workflow.slice(at("Record what the backup holds"), at("- name: Encrypt"));
    expect(summary).toContain("GITHUB_STEP_SUMMARY");
    expect(summary).toMatch(/public-images .*files/);
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
    expect(at("scripts/check-keys.sh --require")).toBeLessThan(at("src/scripts/backup-dump.sh"));
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

describe("backup rehearsal on staging (S-232)", () => {
  test("manual only, staging secrets only, no production path", () => {
    expect(rehearsal).toMatch(/^on:\n {2}workflow_dispatch:\n/m);
    expect(rehearsal).toContain("environment: staging");
    expect(rehearsal).not.toMatch(/production|PRODUCTION_|SUPABASE_S3|GDRIVE/);
    expect([...new Set([...rehearsal.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]))].sort()).toEqual([
      "STAGING_DATABASE_URL", "STAGING_SUPABASE_SERVICE_ROLE_KEY", "STAGING_SUPABASE_URL",
    ]);
  });

  test("runs the weekly backup's own dump script, then restores into a clean local Postgres and compares", () => {
    expect(rehearsal).toContain("src/scripts/backup-dump.sh backup");
    expect(rehearsal).toContain("src/scripts/backup-verify.sh backup");
    expect(rehearsal).toMatch(/RESTORE_DB_URL: postgres:\/\/postgres:postgres@127\.0\.0\.1:5433\/restore/);
  });

  test("staging is only read: photos by GET, no upload, delete or SQL write", () => {
    expect(rehearsal).not.toMatch(/curl[^\n]*-X\s*(POST|PUT|DELETE|PATCH)|--data|rclone|\b(insert|update|delete) (into|from)?\s/i);
  });

  test("the plain copy never leaves the runner: only an age-encrypted archive, kept 1 day", () => {
    const uploads = rehearsal.slice(rehearsal.indexOf("actions/upload-artifact"));
    expect(uploads).toContain("path: rehearsal.tar.age");
    expect(uploads).toContain("retention-days: 1");
    expect(rehearsal).toContain('age --encrypt --recipient "$RECIPIENT"');
  });
});

describe("scripts/backup-verify.sh refuses before touching anything (S-232 AC5, AC6)", () => {
  const run = (dir: string, url: string) => {
    const result = spawnSync("bash", [verifyScript, dir], { env: { PATH: process.env.PATH ?? "", RESTORE_DB_URL: url } as unknown as NodeJS.ProcessEnv, encoding: "utf8" });
    return { status: result.status, out: result.stdout + result.stderr };
  };

  test("a Supabase database is never a restore target", () => {
    const { status, out } = run(mkdtempSync(join(tmpdir(), "bk-")), "postgresql://postgres.abc:pw@aws-0-eu.pooler.supabase.com:5432/postgres");
    expect(status).toBe(1);
    expect(out).toMatch(/points at Supabase/);
  });

  test("a missing backup file stops with a clear error", () => {
    const dir = mkdtempSync(join(tmpdir(), "bk-"));
    writeFileSync(join(dir, "counts.tsv"), "public.orders\t1\n");
    const { status, out } = run(dir, "postgres://postgres:postgres@127.0.0.1:5433/restore");
    expect(status).toBe(1);
    expect(out).toMatch(/database\.dump is missing or empty.*nothing was restored/);
  });
});
