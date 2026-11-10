import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

// The app README (src/README.md) is the handover document: the repository root
// README is the GitHub profile page.
const readme = readFileSync(fileURLToPath(new URL("../../README.md", import.meta.url)), "utf8");
const headings = [...readme.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1]?.trim());

describe("README ownership documentation (NFR-012)", () => {
  test("has the handover headings from day one", () => {
    expect(headings).toEqual(
      expect.arrayContaining([
        "What this is",
        "Services and accounts",
        "Run locally",
        "Deploy",
        "Secrets",
        "Backups",
      ]),
    );
  });
});
