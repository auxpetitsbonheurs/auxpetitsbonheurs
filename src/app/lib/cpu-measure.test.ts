// S-019 (risk T3): the cpu-measure workflow's offline logic. Parsing `wrangler tail --format json`
// output, CPU percentiles per route, redaction (no tokens or queries in the job summary), the
// exit code, scripts/cpu-measure.ts end to end, and the workflow's shape.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { redactPath } from "../../workers/log-redact";
import { cpuByRoute, measureExitCode, timeoutDiagnostics, parseJsonStream, redactText, renderJobSummary, routeName, summarizeRoute } from "./cpu-report";

const TOKEN = "Tok_SECRET-abc123";
const BASE = "https://auxpetitsbonheurs-staging.example.workers.dev";

/** One tail event as wrangler prints it with --format json (pretty-printed, two-space indent). */
function tailEvent(method: string, path: string, cpuTime: number, outcome = "ok"): string {
  const event = {
    outcome,
    scriptName: "auxpetitsbonheurs-staging",
    diagnosticsChannelEvents: [],
    exceptions: [],
    logs: [{ message: ['{"event":"request","route":"/t/[redacted]"}'], level: "log", timestamp: 1 }],
    eventTimestamp: 1_731_000_000_000,
    event: { request: { url: `${BASE}${path}`, method, headers: { cookie: "apb_basket=x" }, cf: {} }, response: { status: 200 } },
    cpuTime,
    wallTime: cpuTime * 10,
  };
  return JSON.stringify(event, null, 2);
}

function capture(warm: { submit: number[]; basket: number[]; tracking: number[] }): string {
  const events = [
    ...warm.submit.map((ms) => tailEvent("POST", "/basket?cpu=warm", ms)),
    ...warm.basket.map((ms) => tailEvent("GET", "/basket?cpu=warm", ms)),
    ...warm.tracking.map((ms) => tailEvent("GET", `/t/${TOKEN}?cpu=warm`, ms)),
    tailEvent("POST", "/menu/chocolate-cake", 1.5),
    tailEvent("GET", "/fr/order/abc/confirmed?x=1", 2),
  ];
  return ["⛅️ wrangler 4.159.0", "-------------------", ...events].join("\n");
}

const ones = (n: number, ms = 1) => Array.from({ length: n }, () => ms);

describe("parseJsonStream", () => {
  test("reads pretty-printed objects one after another, skipping the banner and a truncated last object", () => {
    const text = `banner {not json}\n${tailEvent("GET", "/basket?cpu=warm", 2)}\n${tailEvent("GET", "/", 1)}\n{"cpuTime": 3, "event": {`;
    expect(parseJsonStream(text)).toHaveLength(2);
  });

  test("reads newline-delimited objects and arrays, and braces inside strings", () => {
    expect(parseJsonStream('{"a":"}{"}\n{"b":1}')).toEqual([{ a: "}{" }, { b: 1 }]);
    expect(parseJsonStream('[{"a":1},{"b":"\\"]"}]')).toEqual([{ a: 1 }, { b: '"]' }]);
  });
});

describe("routeName and redactText (no tokens, no queries)", () => {
  test("keeps method and path, drops host and query, redacts tracking and order tokens", () => {
    expect(routeName("get", `${BASE}/t/${TOKEN}?cpu=warm`)).toBe("GET /t/[redacted]");
    expect(routeName("POST", `${BASE}/fr/order/${TOKEN}/confirmed?a=b`)).toBe("POST /fr/order/[redacted]/confirmed");
    expect(routeName("GET", `${BASE}/basket?cpu=warm`)).toBe("GET /basket");
    expect(routeName("GET", "not a url")).toBeNull();
  });

  test("uses the same token rule as the Worker's request log", () => {
    for (const path of [`/t/${TOKEN}`, `/order/${TOKEN}/confirmed`, `/fr/t/${TOKEN}`, "/basket"]) {
      expect(routeName("GET", `${BASE}${path}`)).toBe(`GET ${redactPath(path)}`);
    }
  });

  test("redacts URLs and credentials in wrangler's messages", () => {
    const out = redactText(`GET ${BASE}/t/${TOKEN}?cpu=warm failed; Authorization: Bearer abc.def; token=xyz`);
    expect(out).not.toMatch(new RegExp(`${TOKEN}|cpu=warm|abc\\.def|xyz`));
    expect(out).toContain("/t/[redacted]");
  });
});

describe("CPU per route", () => {
  test("hot paths always listed first; tagged requests only; other routes are informational", () => {
    const routes = cpuByRoute(capture({ submit: [4, 2], basket: [1], tracking: [] }));
    expect(routes.map((r) => [r.route, r.hotPath, r.cpuMs])).toEqual([
      ["POST /basket", "checkout-submit", [4, 2]],
      ["GET /basket", "basket", [1]],
      ["GET /t/[redacted]", "tracking", []],
      ["POST /menu/chocolate-cake", null, [1.5]],
      ["GET /fr/order/[redacted]/confirmed", null, [2]],
    ]);
  });

  test("nearest-rank p50, p95, p99 and max", () => {
    const cpuMs = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    expect(summarizeRoute({ route: "GET /basket", hotPath: "basket", cpuMs, exceeded: 0 })).toMatchObject({
      count: 100,
      p50: 50,
      p95: 95,
      p99: 99,
      max: 100,
      verdict: "fail",
    });
  });

  test("a hot path passes under 10 ms p99, fails at or above it or when an invocation exceeded the CPU limit", () => {
    const pass = summarizeRoute({ route: "GET /basket", hotPath: "basket", cpuMs: [...ones(99), 12], exceeded: 0 });
    expect(pass.p99).toBe(1);
    expect(pass.verdict).toBe("pass");
    expect(summarizeRoute({ route: "GET /basket", hotPath: "basket", cpuMs: [10], exceeded: 0 }).verdict).toBe("fail");
    expect(summarizeRoute({ route: "GET /basket", hotPath: "basket", cpuMs: [1], exceeded: 1 }).verdict).toBe("fail");
    expect(summarizeRoute({ route: "GET /x", hotPath: null, cpuMs: [50], exceeded: 0 }).verdict).toBe("info");
  });

  test("counts invocations Cloudflare stopped for CPU", () => {
    const text = [tailEvent("POST", "/basket?cpu=warm", 11, "exceededCpu"), tailEvent("POST", "/basket?cpu=warm", 2)].join("\n");
    expect(cpuByRoute(text)[0]).toMatchObject({ cpuMs: [11, 2], exceeded: 1 });
  });

  test("exit code 1 when a hot path fails or has no samples; slow non-hot routes never fail the job", () => {
    const summarize = (text: string) => cpuByRoute(text).map(summarizeRoute);
    expect(measureExitCode(summarize(capture({ submit: ones(50), basket: ones(50), tracking: ones(50) })))).toBe(0);
    expect(measureExitCode(summarize(capture({ submit: ones(50, 12), basket: ones(50), tracking: ones(50) })))).toBe(1);
    expect(measureExitCode(summarize(capture({ submit: ones(50), basket: ones(50), tracking: [] })))).toBe(1);
    expect(measureExitCode(summarize(`${capture({ submit: ones(5), basket: ones(5), tracking: ones(5) })}\n${tailEvent("GET", "/", 80)}`))).toBe(0);
  });

  test("job summary table: route names only, verdicts, and the result", () => {
    const summaries = cpuByRoute(capture({ submit: ones(50, 12), basket: ones(50), tracking: ones(50) })).map(summarizeRoute);
    const md = renderJobSummary({ summaries, phase: "warm", rounds: 50, host: "auxpetitsbonheurs-staging.example.workers.dev" });
    expect(md).toContain("| Route | Count | p50 | p95 | p99 | Max | Exceeded CPU | Verdict |");
    expect(md).toContain("| `POST /basket` | 50 | 12 | 12 | 12 | 12 | 0 | **FAIL** |");
    expect(md).toContain("| `GET /basket` | 50 | 1 | 1 | 1 | 1 | 0 | pass |");
    expect(md).toContain("| `GET /t/[redacted]` | 50 |");
    expect(md).toContain("**Result: FAIL.**");
    expect(md).not.toMatch(new RegExp(`${TOKEN}|\\?|cpu=|https://`));
  });
});

describe("scripts/cpu-measure.ts", () => {
  const script = fileURLToPath(new URL("../../scripts/cpu-measure.ts", import.meta.url));
  const run = (tail: string, tailLog = "") => {
    const dir = mkdtempSync(join(tmpdir(), "cpu-measure-"));
    const files = { tail: join(dir, "tail.json"), log: join(dir, "tail.log"), summary: join(dir, "summary.md"), csv: join(dir, "samples.csv"), md: join(dir, "report.md") };
    writeFileSync(files.tail, tail);
    writeFileSync(files.log, tailLog);
    writeFileSync(files.summary, "");
    const args = ["--tail", files.tail, "--tail-log", files.log, "--phase", "warm", "--rounds", "50", "--host", "h", "--summary", files.summary];
    const result = spawnSync(process.execPath, [script, ...args, "--samples-out", files.csv, "--report-out", files.md], { encoding: "utf8" });
    const read = (f: string) => readFileSync(f, "utf8");
    return { status: result.status, out: result.stdout + result.stderr, summary: read(files.summary), csv: read(files.csv), report: read(files.md) };
  };

  test("pass: prints and appends the table, writes the CSV and report, exits 0, never echoes a token", () => {
    const { status, out, summary, csv, report } = run(capture({ submit: ones(50, 3), basket: ones(50, 2), tracking: ones(50, 1) }));
    expect(status).toBe(0);
    expect(summary).toContain("**Result: PASS.**");
    expect(out).toContain("| `GET /t/[redacted]` | 50 | 1 | 1 | 1 | 1 | 0 | pass |");
    expect(csv.split("\n")[1]).toBe("checkout-submit,warm,3");
    expect(report).toContain("Overall: PENDING"); // warm only: cold rows stay "not measured"
    for (const text of [out, summary, csv, report]) expect(text).not.toContain(TOKEN);
  });

  test("over the limit: still prints the table, exits 1", () => {
    const { status, out } = run(capture({ submit: ones(50), basket: ones(50, 15), tracking: ones(50) }));
    expect(status).toBe(1);
    expect(out).toContain("| `GET /basket` | 50 | 15 | 15 | 15 | 15 | 0 | **FAIL** |");
  });

  test("no events (e.g. the token cannot tail): error with wrangler's redacted messages, exits 1", () => {
    const { status, out } = run("⛅️ wrangler\n", `✘ [ERROR] A request to the Cloudflare API failed. Authentication error [code: 10000]\nGET ${BASE}/t/${TOKEN}?cpu=warm`);
    expect(status).toBe(1);
    expect(out).toContain("::error::No CPU samples arrived from wrangler tail");
    expect(out).toContain("Authentication error [code: 10000]");
    expect(out).not.toContain(TOKEN);
  });
});

describe("scripts/cpu-measure.ts --failures-only (deploy smoke check)", () => {
  const script = fileURLToPath(new URL("../../scripts/cpu-measure.ts", import.meta.url));

  test("prints only the failed requests' diagnostics, no CPU table, exits 0, never a token", () => {
    const dir = mkdtempSync(join(tmpdir(), "smoke-"));
    const at = 1_731_000_000_000;
    const tail = JSON.stringify({
      outcome: "ok",
      eventTimestamp: at + 10,
      exceptions: [],
      logs: [{ level: "error", message: [`{"event":"server_error","route":"/t/${TOKEN}","causes":[{"code":"QUERY_TIMEOUT"}]}`] }],
      event: { request: { url: `${BASE}/`, method: "GET" }, response: { status: 503 } },
      cpuTime: 4,
    });
    writeFileSync(join(dir, "tail.json"), tail);
    writeFileSync(join(dir, "failures.jsonl"), `${JSON.stringify({ route: "GET /", startedAt: at, endedAt: at + 900, status: 503 })}\n`);

    const result = spawnSync(process.execPath, [script, "--failures-only", "--tail", join(dir, "tail.json"), "--timeouts", join(dir, "failures.jsonl"), "--summary", ""], { encoding: "utf8" });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("`GET /` answered 503");
    expect(result.stdout).toContain("QUERY_TIMEOUT");
    expect(result.stdout).not.toContain("| Route |");
    expect(result.stdout).not.toContain(TOKEN);
  });
});

describe("cpu-measure workflow", () => {
  const workflow = readFileSync(fileURLToPath(new URL("../../../.github/workflows/cpu-measure.yml", import.meta.url)), "utf8");
  const runBlocks = workflow.slice(workflow.indexOf("\n    steps:")).split(/\n\s+- (?:name|uses):/).filter((step) => /\n\s+run:/.test(step)).map((step) => step.slice(step.search(/\n\s+run:/)));

  test("manual only, read-only contents, staging environment only", () => {
    expect(workflow).toMatch(/^on:\n {2}workflow_dispatch:\n/m);
    expect(workflow).not.toMatch(/^\s{2}(push|pull_request|schedule|workflow_run):/m);
    expect(workflow).toMatch(/^permissions:\n {2}contents: read\n\n/m);
    expect(workflow).toContain("environment: staging");
    expect(workflow).not.toMatch(/production/i);
    expect(workflow).toContain("npx wrangler tail auxpetitsbonheurs-staging --format json");
  });

  test("runs the S-019 load script and the summary script, and uses Cloudflare secrets by name", () => {
    expect(workflow).toContain('npm run cpu:load -- --url "$STAGING_URL" --phase "$PHASE" --count "$COUNT"');
    expect(workflow).toContain("node scripts/cpu-measure.ts");
    expect([...new Set([...workflow.matchAll(/secrets\.([A-Z_]+)/g)].map((m) => m[1]))].sort()).toEqual(["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"]);
  });

  test("inputs reach shell only as environment variables; raw tail output is never printed or uploaded", () => {
    expect(runBlocks.length).toBeGreaterThan(0);
    expect(runBlocks.join("\n")).not.toMatch(/\$\{\{/);
    expect(workflow).not.toMatch(/\bcat\b[^\n]*tail\.(json|log)|tail -[nf][^\n]*tail\.(json|log)|echo[^\n]*\$CLOUDFLARE/);
    expect(workflow).not.toMatch(/path:[^\n]*(tail|cpu-raw)/);
    expect(workflow).not.toMatch(/continue-on-error:\s*true/);
  });
});

describe("timed-out routes are explained by the matching tail event", () => {
  const stamp = 1_731_000_000_000;
  const event = (path: string, at: number, extra: Record<string, unknown>) =>
    JSON.stringify({ outcome: "canceled", eventTimestamp: at, exceptions: [], logs: [], event: { request: { url: `${BASE}${path}`, method: "GET" } }, ...extra });

  test("prints outcome, exceptions and error log lines, redacted, for the timed-out route only", () => {
    const tail = [
      event("/menu/chocolate-cake", stamp + 100, {
        outcome: "canceled",
        exceptions: [{ name: "Error", message: `failed for ${BASE}/t/${TOKEN}?x=1 token=${TOKEN}` }],
        logs: [{ level: "error", message: ['{"event":"request_attempt_failed","reason":"stalled"}'] }, { level: "log", message: ["noise"] }],
      }),
      event("/healthz", stamp + 120, { outcome: "ok" }),
      event("/menu/chocolate-cake", stamp - 600_000, { outcome: "ok" }),
    ].join("\n");

    const text = timeoutDiagnostics(tail, [{ route: "GET /menu/chocolate-cake", startedAt: stamp, endedAt: stamp + 15_000 }]);

    expect(text).toContain("GET /menu/chocolate-cake");
    expect(text).toContain("outcome canceled");
    expect(text).toContain("request_attempt_failed");
    expect(text).not.toContain("noise");
    expect(text).not.toContain("healthz");
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain("x=1");
  });

  test("says so when no tail event matches (the request never reached the Worker, or the tail missed it)", () => {
    expect(timeoutDiagnostics("", [{ route: "GET /menu/chocolate-cake", startedAt: stamp, endedAt: stamp + 15_000 }])).toContain("no matching tail event");
  });

  test("nothing to print without timeouts", () => {
    expect(timeoutDiagnostics("", [])).toBe("");
  });

  test("a non-2xx/3xx answer is explained too: status, exceptions, console error and warn lines", () => {
    const tail = event("/menu/chocolate-cake", stamp + 50, {
      outcome: "ok",
      event: { request: { url: `${BASE}/menu/chocolate-cake`, method: "POST" }, response: { status: 500 } },
      exceptions: [],
      logs: [
        { level: "error", message: ["PostgresError: connection to postgres://apb:hunter2@db.example.co:6543/postgres?sslmode=require failed for cake@example.com, +230 5123 4567"] },
        { level: "warn", message: ["retrying"] },
      ],
    });

    const text = timeoutDiagnostics(tail, [{ route: "POST /menu/chocolate-cake", startedAt: stamp, endedAt: stamp + 300, status: 500 }]);

    expect(text).toContain("`POST /menu/chocolate-cake` answered 500");
    expect(text).toContain("response 500");
    expect(text).toContain("PostgresError");
    expect(text).toContain("retrying");
    expect(text).not.toMatch(/hunter2|apb:|db\.example\.co|cake@example\.com|5123 4567/);
  });
});
