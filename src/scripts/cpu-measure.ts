// Summarises a `wrangler tail --format json` capture into CPU per route (S-019, risk T3), for
// .github/workflows/cpu-measure.yml. Appends a markdown table to the job summary, prints it,
// optionally writes the samples CSV and the cpu-measurements.md report, and exits 1 when a hot
// path's p99 is at or above 10 ms (or has no samples). Never prints raw tail output (URLs hold
// tracking tokens); wrangler's own messages are printed only redacted, when no events arrived.
// Usage: node scripts/cpu-measure.ts --tail <tail.json> [--tail-log <stderr file>] --phase warm
//          --rounds 50 --host <host> [--summary <file>] [--samples-out <csv>] [--report-out <md>]
// Runs with Node's built-in TypeScript type stripping (Node >= 22.18).
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import {
  type Phase,
  type TimedOutRequest,
  cpuByRoute,
  groupSamples,
  measureExitCode,
  parseCpuSamples,
  redactText,
  renderCpuReport,
  renderJobSummary,
  samplesCsv,
  summarizeRoute,
  timeoutDiagnostics,
} from "../app/lib/cpu-report.ts";

const { values } = parseArgs({
  options: {
    tail: { type: "string" },
    "tail-log": { type: "string" },
    timeouts: { type: "string" },
    phase: { type: "string", default: "warm" },
    rounds: { type: "string", default: "0" },
    host: { type: "string", default: "staging" },
    summary: { type: "string", default: process.env.GITHUB_STEP_SUMMARY },
    "samples-out": { type: "string" },
    "report-out": { type: "string" },
  },
});
if (!values.tail) throw new Error("Pass --tail <file>");
const phase = values.phase as Phase;
if (phase !== "cold" && phase !== "warm") throw new Error("--phase must be cold or warm");

const raw = existsSync(values.tail) ? readFileSync(values.tail, "utf8") : "";
const summaries = cpuByRoute(raw).map(summarizeRoute);
const markdown = renderJobSummary({ summaries, phase, rounds: Number(values.rounds), host: values.host });
console.log(markdown);
if (values.summary) appendFileSync(values.summary, `${markdown}\n`);

const timeouts: TimedOutRequest[] = values.timeouts && existsSync(values.timeouts)
  ? readFileSync(values.timeouts, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line))
  : [];
const diagnostics = timeoutDiagnostics(raw, timeouts);
if (diagnostics) {
  console.log(diagnostics);
  if (values.summary) appendFileSync(values.summary, `${diagnostics}\n`);
}

if (summaries.every((s) => s.count === 0)) {
  console.log("::error::No CPU samples arrived from wrangler tail. Its messages (redacted):");
  const log = values["tail-log"] && existsSync(values["tail-log"]) ? readFileSync(values["tail-log"], "utf8") : "";
  console.log(redactText(log.split("\n").slice(-30).join("\n")) || "(none)");
}

const samples = parseCpuSamples(raw);
if (values["samples-out"]) writeFileSync(values["samples-out"], samplesCsv(samples));
if (values["report-out"]) {
  const date = new Date().toISOString().slice(0, 10);
  writeFileSync(values["report-out"], renderCpuReport({ date, environment: "staging", results: groupSamples(samples) }));
}
process.exitCode = measureExitCode(summaries);
