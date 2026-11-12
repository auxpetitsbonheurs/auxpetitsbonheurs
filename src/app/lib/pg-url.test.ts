import { describe, expect, test } from "vitest";
import { withLibpqSslModes } from "./pg-url";

const base = "postgresql://user:placeholder@host.example:5432/postgres";

describe("withLibpqSslModes (node-postgres keeps libpq's sslmode meaning)", () => {
  test("a URL with sslmode gets uselibpqcompat, the rest untouched", () => {
    const url = `${base}?sslmode=require`;
    expect(withLibpqSslModes(url)).toBe(`${url}&uselibpqcompat=true`);
  });

  test("URLs without sslmode, or already explicit, are unchanged", () => {
    for (const url of [base, `${base}?application_name=apb`, `${base}?sslmode=verify-full&uselibpqcompat=false`]) {
      expect(withLibpqSslModes(url)).toBe(url);
    }
  });
});
