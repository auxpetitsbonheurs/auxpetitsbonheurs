// Dependency audit gate (threat model G-18, SEC-12). A high or critical advisory fails CI, with one
// narrow escape: an advisory that has NO patched version yet and reaches only build/test tools
// (not the shipped Worker) may be listed in audit-exceptions.json with a reason and an expiry
// date. Advisories in runtime dependencies are never excused; an expired exception fails again.

export interface AuditException {
  advisory: string; // GHSA id, e.g. "GHSA-fc5q-39xc-vjpf"
  reason: string;
  expires: string; // YYYY-MM-DD; reviewed again by then
}

interface AuditVia {
  url?: string;
  severity?: string;
}

interface AuditReport {
  vulnerabilities?: Record<string, { severity: string; via: (AuditVia | string)[] }>;
}

const BLOCKING = new Set(["high", "critical"]);

/** GHSA ids of the high/critical advisories in an `npm audit --json` report. */
export function blockingAdvisories(report: AuditReport): Set<string> {
  const ids = new Set<string>();
  for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
    for (const via of vulnerability.via) {
      if (typeof via === "string" || !via.url || !BLOCKING.has(via.severity ?? "")) continue;
      const id = /GHSA-[a-z0-9-]+/i.exec(via.url)?.[0];
      if (id) ids.add(id);
    }
  }
  return ids;
}

/** Problems that fail the gate: runtime advisories, and dev-only ones without a live exception. */
export function auditProblems(all: AuditReport, runtimeOnly: AuditReport, exceptions: readonly AuditException[], today: string): string[] {
  const runtime = blockingAdvisories(runtimeOnly);
  const problems: string[] = [];
  for (const id of blockingAdvisories(all)) {
    if (runtime.has(id)) {
      problems.push(`${id} reaches a runtime dependency: update it (exceptions never apply to shipped code).`);
      continue;
    }
    const exception = exceptions.find((e) => e.advisory.toLowerCase() === id.toLowerCase());
    if (!exception) problems.push(`${id} (build/test tools): update it, or list it in audit-exceptions.json if no patched version exists.`);
    else if (exception.expires < today) problems.push(`${id}: its exception expired on ${exception.expires}; check for a patched version.`);
  }
  return problems;
}
