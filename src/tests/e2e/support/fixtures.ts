// The `test` every e2e spec imports: Playwright's, plus a per-worker database
// connection for specs that create their own data (S-005 AC4).
import { test as base } from "@playwright/test";
import type postgres from "postgres";
import { connectE2eDatabase } from "./database";

export const test = base.extend<object, { db: postgres.Sql }>({
  db: [
    // Playwright requires an object pattern here, even when no fixtures are used.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const sql = connectE2eDatabase();
      await use(sql);
      await sql.end();
    },
    { scope: "worker" },
  ],
});

export { expect } from "@playwright/test";
