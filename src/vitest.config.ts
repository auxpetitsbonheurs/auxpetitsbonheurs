import { defineConfig } from "vitest/config";

// Unit tests run in Node, separate from the Workers/React Router Vite build.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ["app/**/*.test.{ts,tsx}", "workers/**/*.test.ts"],
    environment: "node",
  },
});
