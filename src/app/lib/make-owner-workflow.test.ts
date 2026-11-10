// The make-owner workflow (.github/workflows/make-owner.yml): manual only, least privilege,
// the environment's protection and database secret, inputs never interpolated into shell.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const workflow = readFileSync(fileURLToPath(new URL("../../../.github/workflows/make-owner.yml", import.meta.url)), "utf8");
const runLines = workflow.split("\n").filter((line, i, all) => {
  // `run:` lines plus the indented lines of a `run: |` block.
  if (/^\s+run:/.test(line)) return true;
  const block = all.slice(0, i).reverse().find((l) => /^\s+[a-z-]+:/.test(l) && !/^\s{10,}/.test(l));
  return Boolean(block && /^\s+run:\s*\|/.test(block));
});

describe("make-owner workflow", () => {
  test("runs only when started by hand, with environment (staging|production), email and optional name", () => {
    expect(workflow).toMatch(/^on:\n {2}workflow_dispatch:\n/m);
    expect(workflow).not.toMatch(/^\s{2}(push|pull_request|schedule|workflow_run):/m);
    expect(workflow).toMatch(/environment:\n\s+description:.*\n\s+type: choice\n\s+options: \[staging, production\]\n\s+required: true/);
    expect(workflow).toMatch(/email:\n\s+description:.*\n\s+type: string\n\s+required: true/);
    expect(workflow).toMatch(/name:\n\s+description:.*\n\s+type: string\n\s+required: false/);
  });

  test("least privilege: read-only contents, no persisted git credentials", () => {
    expect(workflow).toMatch(/^permissions:\n {2}contents: read\n\n/m);
    expect(workflow).toContain("persist-credentials: false");
  });

  test("runs in the chosen GitHub Environment (production's required reviewer applies)", () => {
    expect(workflow).toContain("environment: ${{ inputs.environment }}");
  });

  test("uses the environment's database secret and runs the make:owner script", () => {
    expect(workflow).toContain(
      "DATABASE_URL: ${{ inputs.environment == 'production' && secrets.PRODUCTION_DATABASE_URL || secrets.STAGING_DATABASE_URL }}",
    );
    expect(workflow).toContain("run: npm run make:owner");
    expect([...workflow.matchAll(/secrets\.([A-Z_]+)/g)].map((m) => m[1]).sort()).toEqual(
      ["PRODUCTION_DATABASE_URL", "PRODUCTION_DATABASE_URL", "STAGING_DATABASE_URL", "STAGING_DATABASE_URL"],
    );
  });

  test("fails clearly when the environment's database secret is missing", () => {
    expect(workflow).toContain('scripts/check-keys.sh --require "$name"');
  });

  test("inputs and secrets reach shell commands only as environment variables", () => {
    expect(runLines.length).toBeGreaterThan(0);
    expect(runLines.join("\n")).not.toMatch(/\$\{\{/);
  });

  test("never prints the database URL and never lets a failing step pass", () => {
    expect(workflow).not.toMatch(/echo .*DATABASE_URL/);
    expect(workflow).not.toMatch(/continue-on-error:\s*true|\|\|\s*true/);
    expect(workflow).not.toMatch(/postgres(ql)?:\/\//);
  });
});
