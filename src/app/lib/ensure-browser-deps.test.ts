// CI runs 43031233818 and 43039279359 never reached a test: `playwright install --with-deps`
// runs `apt-get update` and the Ubuntu mirrors did not resolve ("Temporary failure resolving").
// The browser itself downloads from Playwright's CDN, so apt is only needed when the runner
// image lacks a system library. scripts/ensure-browser-deps.sh checks first and retries apt.
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const script = fileURLToPath(new URL("../../scripts/ensure-browser-deps.sh", import.meta.url));

function sandbox({ lddOutput, installFailures }: { lddOutput: string; installFailures: number }) {
  const dir = mkdtempSync(join(tmpdir(), "browser-deps-"));
  const browsers = join(dir, "browsers");
  mkdirSync(join(browsers, "chromium-1", "chrome-linux"), { recursive: true });
  copyFileSync("/bin/true", join(browsers, "chromium-1", "chrome-linux", "chrome"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "ldd"), `#!/bin/sh\necho '${lddOutput}'\n`);
  chmodSync(join(bin, "ldd"), 0o755);
  const calls = join(dir, "calls");
  const install = join(dir, "install.sh");
  writeFileSync(
    install,
    `#!/bin/sh\necho x >> "${calls}"\n[ "$(wc -l < "${calls}")" -le ${installFailures} ] && exit 100\nexit 0\n`,
  );
  chmodSync(install, 0o755);
  const run = () =>
    spawnSync("bash", [script], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        PLAYWRIGHT_BROWSERS_PATH: browsers,
        INSTALL_DEPS_CMD: install,
        RETRY_DELAY: "0",
      },
    });
  const attempts = () => {
    try {
      return readFileSync(calls, "utf8").trim().split("\n").length;
    } catch {
      return 0;
    }
  };
  return { run, attempts, browsers };
}

describe("ensure-browser-deps.sh", () => {
  test("does not touch apt when every library of the browser resolves", () => {
    const s = sandbox({ lddOutput: "\tlibc.so.6 => /lib/libc.so.6 (0x1)", installFailures: 0 });
    const r = s.run();

    expect(r.status).toBe(0);
    expect(s.attempts()).toBe(0);
  });

  test("installs the system libraries when one is missing", () => {
    const s = sandbox({ lddOutput: "\tlibnss3.so => not found", installFailures: 0 });

    expect(s.run().status).toBe(0);
    expect(s.attempts()).toBe(1);
  });

  test("retries a failed apt run (mirror outage) and then succeeds", () => {
    const s = sandbox({ lddOutput: "\tlibnss3.so => not found", installFailures: 2 });

    expect(s.run().status).toBe(0);
    expect(s.attempts()).toBe(3);
  });

  test("fails loudly, after three attempts, when apt never recovers", () => {
    const s = sandbox({ lddOutput: "\tlibnss3.so => not found", installFailures: 99 });
    const r = s.run();

    expect(r.status).not.toBe(0);
    expect(s.attempts()).toBe(3);
    expect(r.stderr).toContain("libnss3.so");
  });

  test("fails when no browser is installed, instead of passing vacuously", () => {
    const dir = mkdtempSync(join(tmpdir(), "browser-deps-empty-"));
    const r = spawnSync("bash", [script], {
      encoding: "utf8",
      env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: dir, RETRY_DELAY: "0" },
    });

    expect(r.status).not.toBe(0);
  });
});
