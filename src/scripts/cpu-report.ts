// Writes docs/architecture/cpu-measurements.md from CPU samples (S-019, risk T3).
// Input: `wrangler tail --format json` output, a Workers Logs JSON export, or a CSV
// `path,phase,cpu_ms` typed from the dashboard (see docs/runbooks/worker-cpu.md).
// Usage: npm run cpu:report -- <samples file> [--date YYYY-MM-DD] [--env staging] [--samples-out <csv>]
//        npm run cpu:report -- --template   (writes the empty "not measured" report)
// Runs with Node's built-in TypeScript type stripping (Node >= 22.18).
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { groupSamples, parseCpuSamples, renderCpuReport, samplesCsv } from "../app/lib/cpu-report.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    date: { type: "string" },
    env: { type: "string", default: "staging" },
    template: { type: "boolean", default: false },
    out: { type: "string", default: "../docs/architecture/cpu-measurements.md" },
    "samples-out": { type: "string" },
  },
});

const out = resolve(values.out);
if (values.template) {
  writeFileSync(out, renderCpuReport({ date: null, environment: values.env, results: [] }));
} else {
  const input = positionals[0];
  if (!input) throw new Error("Pass the samples file (or --template)");
  const samples = parseCpuSamples(readFileSync(input, "utf8"));
  const date = values.date ?? new Date().toISOString().slice(0, 10);
  const report = renderCpuReport({ date, environment: values.env, results: groupSamples(samples) });
  writeFileSync(out, report);
  // Commit this CSV as evidence, never the raw tail/log file (it holds URLs with tokens).
  if (values["samples-out"]) writeFileSync(resolve(values["samples-out"]), samplesCsv(samples));
  console.log(report.match(/^Overall: .*$/m)?.[0] ?? "");
}
console.log(`Wrote ${out}`);
