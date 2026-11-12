import { defineConfig } from "vitest/config";

// Unit tests run in Node, separate from the Workers/React Router Vite build.
// The PGlite database is migrated once per run (global setup) and reused per file; see
// app/db/testing/pglite.ts. Every core runs a worker: CI's 2-core runner otherwise gets one.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ["app/**/*.test.{ts,tsx}", "workers/**/*.test.ts", "tests/workflows/**/*.test.ts"],
    environment: "node",
    globalSetup: ["./app/db/testing/pglite-global-setup.ts"],
    setupFiles: ["./app/server/testing/vitest-setup.ts"],
    maxWorkers: "100%",
  },
});
