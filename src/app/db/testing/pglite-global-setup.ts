// Vitest global setup: migrates one PGlite database for the whole run and writes its data
// directory to a temp file; each test file loads it (./pglite.ts) instead of running initdb
// and every migration again. Removed when the run ends.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestProject } from "vitest/node";
import { buildTemplateDataDir } from "./pglite";

export default async function setup(project: TestProject) {
  const dir = await mkdtemp(join(tmpdir(), "apb-pglite-"));
  const path = join(dir, "template.tar");
  const dump = await buildTemplateDataDir();
  await writeFile(path, new Uint8Array(await dump.arrayBuffer()));
  project.provide("pgliteTemplatePath", path);
  return async () => {
    await rm(dir, { recursive: true, force: true });
  };
}
