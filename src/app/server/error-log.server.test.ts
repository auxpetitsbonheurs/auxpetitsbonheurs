// A failed loader/action is logged with its cause chain (staging 500s showed only drizzle's
// "Failed query" line: the driver error that explains it was dropped). Never values or PII.
import { describe, expect, test } from "vitest";
import { serverErrorLogLine } from "./error-log.server";

describe("server error log line", () => {
  test("keeps the first message line and every cause's name, code and message", () => {
    const driver = Object.assign(new Error("Network connection lost."), { name: "PostgresError", code: "CONNECTION_CLOSED" });
    const query = new Error('Failed query: select "id" from "product" where "product"."id" in ($1)\nparams: 16cb5e3a-0448-4fa0-9b12-345678cc1e9d', { cause: driver });

    const line = serverErrorLogLine(query, "POST", "/menu/chocolate-cake");

    expect(line).toMatchObject({ level: "error", event: "server_error", method: "POST", route: "/menu/chocolate-cake" });
    expect(line.error).toBe('Error: Failed query: select "id" from "product" where "product"."id" in ($1)');
    expect(line.causes).toEqual([{ name: "PostgresError", code: "CONNECTION_CLOSED", message: "Network connection lost." }]);
    expect(JSON.stringify(line)).not.toContain("16cb5e3a");
  });

  test("redacts connection strings, emails, phone numbers and token paths", () => {
    const cause = new Error("connect to postgres://apb:hunter2@db.example.co:6543/postgres failed for cake@example.com +230 5123 4567");
    const line = serverErrorLogLine(new Error("boom", { cause }), "GET", "/t/SECRET-token");

    expect(JSON.stringify(line)).not.toMatch(/hunter2|db\.example\.co|cake@example\.com|5123 4567|SECRET-token/);
  });

  test("non-Error values and cause cycles are safe", () => {
    const a: Error & { cause?: unknown } = new Error("a");
    a.cause = a;
    expect(serverErrorLogLine(a, "GET", "/").causes).toHaveLength(0);
    expect(serverErrorLogLine("weird", "GET", "/").error).toBe("non-error thrown");
  });
});
