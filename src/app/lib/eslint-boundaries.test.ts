import { ESLint } from "eslint";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const cwd = fileURLToPath(new URL("../..", import.meta.url));
const eslint = new ESLint({ cwd });

async function restrictedImports(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? [])
    .filter((m) => m.ruleId === "no-restricted-imports")
    .map((m) => m.message);
}

const serverImport = `import { parseEnv } from "~/server/env.server";\nexport const read = parseEnv;\n`;

describe("server-only module boundary (NFR-003)", () => {
  test("a client component importing a .server module fails lint", async () => {
    const messages = await restrictedImports(serverImport, "app/components/fixture.tsx");

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/server-only/);
  });

  test("a relative .server import from shared lib code fails lint too", async () => {
    const code = `import { createRequestDb } from "../server/db.server";\nexport const make = createRequestDb;\n`;

    expect(await restrictedImports(code, "app/lib/fixture.ts")).toHaveLength(1);
  });

  test("a client component importing a shared module passes", async () => {
    const code = `import { cn } from "~/lib/utils";\nexport const join = cn;\n`;

    expect(await restrictedImports(code, "app/components/fixture.tsx")).toEqual([]);
  });

  test("server code may import .server modules", async () => {
    expect(await restrictedImports(serverImport, "app/server/fixture.server.ts")).toEqual([]);
  });
}, 30_000);
