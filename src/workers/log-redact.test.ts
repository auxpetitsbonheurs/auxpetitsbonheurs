// S-019 AC5 (NFR-004): one structured line per request; tokens never reach the logs.
import { describe, expect, test } from "vitest";
import { redactPath, requestLogLine } from "./log-redact";

describe("redactPath", () => {
  test.each([
    ["/t/AbC123_-xyz", "/t/[redacted]"],
    ["/fr/t/AbC123_-xyz", "/fr/t/[redacted]"],
    ["/order/AbC123/confirmed", "/order/[redacted]/confirmed"],
    ["/fr/order/AbC123/confirmed", "/fr/order/[redacted]/confirmed"],
    ["/order/AbC123", "/order/[redacted]"],
    ["/T/AbC123", "/T/[redacted]"],
    ["/basket", "/basket"],
    ["/menu/chocolate-cake", "/menu/chocolate-cake"],
    ["/admin/orders/5f0c", "/admin/orders/5f0c"],
    // S-029: an invitation link is a credential until it is used.
    ["/admin/invite/AbC123_-xyz", "/admin/invite/[redacted]"],
    ["/admin/invite/AbC123_-xyz.data", "/admin/invite/[redacted]"],
  ])("%s -> %s", (path, expected) => {
    expect(redactPath(path)).toBe(expected);
  });
});

describe("requestLogLine", () => {
  test("carries request id, method, route, status and duration, and nothing else", () => {
    const request = new Request("https://x.workers.dev/t/secret-token?lang=fr&email=a@b.c", {
      headers: { "cf-ray": "8abc-MRU", Cookie: "apb_basket=secret; sb-auth=tok" },
    });

    const line = requestLogLine(request, 200, 12.5);

    expect(line).toEqual({ level: "info", event: "request", requestId: "8abc-MRU", method: "GET", route: "/t/[redacted]", status: 200, durationMs: 12.5 });
    const text = JSON.stringify(line);
    for (const secret of ["secret-token", "apb_basket", "sb-auth", "a@b.c", "lang="]) expect(text).not.toContain(secret);
  });

  test("makes up a request id when Cloudflare sent none", () => {
    const line = requestLogLine(new Request("https://x/basket", { method: "POST" }), 302, 3);

    expect(line.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(line.method).toBe("POST");
  });
});

describe("platform logs (S-019 AC5)", () => {
  test("Workers Logs keeps our structured lines but not the automatic invocation logs, which carry full URLs with tokens", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { readJsonc } = await import("~/lib/deploy-guard");
    const config = readJsonc(readFileSync(fileURLToPath(new URL("../wrangler.jsonc", import.meta.url)), "utf8")) as {
      observability?: { enabled?: boolean; logs?: { invocation_logs?: boolean } };
      env: Record<string, { observability?: unknown }>;
    };

    expect(config.observability?.enabled).toBe(true);
    expect(config.observability?.logs?.invocation_logs).toBe(false);
    // Production inherits it; staging may turn invocation logs on briefly for a CPU run (docs/runbooks/worker-cpu.md step 5).
    expect(config.env.production!.observability).toBeUndefined();
  });
});
