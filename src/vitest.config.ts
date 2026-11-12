import { defineConfig } from "vitest/config";

// Unit tests run in Node, separate from the Workers/React Router Vite build.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ["app/**/*.test.{ts,tsx}", "workers/**/*.test.ts", "tests/workflows/**/*.test.ts"],
    environment: "node",
    setupFiles: ["./app/server/testing/vitest-setup.ts"],
  },
});
