// JS budget (NFR-001): gzipped initial JavaScript per route must stay within
// project.yaml `budgets.js_initial_kb`. Pure functions; the CLI that reads the
// build output lives in scripts/check-js-budget.ts.

/** The subset of React Router's `window.__reactRouterManifest` we need. */
export interface RouteManifest {
  entry: { module: string; imports?: string[] };
  routes: Record<string, { id: string; parentId?: string; module: string; imports?: string[] }>;
}

export interface RouteChunks {
  route: string;
  chunks: string[];
}

export interface RouteSize {
  route: string;
  gzipBytes: number;
}

export interface BudgetResult {
  ok: boolean;
  failures: RouteSize[];
  report: string;
}

/** kB as Vite reports it (1 kB = 1000 bytes). */
const BYTES_PER_KB = 1000;

function ancestry(manifest: RouteManifest, routeId: string): string[] {
  const chain: string[] = [];
  for (let id: string | undefined = routeId; id; id = manifest.routes[id]?.parentId) {
    chain.unshift(id);
  }
  return chain;
}

/** For every leaf route: the JS modules loaded on a first visit (entry, ancestors, route). */
export function routeInitialChunks(manifest: RouteManifest): RouteChunks[] {
  const routes = Object.values(manifest.routes);
  const parents = new Set(routes.map((r) => r.parentId).filter(Boolean));

  return routes
    .filter((r) => !parents.has(r.id))
    .map((leaf) => {
      const chunks = new Set<string>([manifest.entry.module, ...(manifest.entry.imports ?? [])]);
      for (const id of ancestry(manifest, leaf.id)) {
        const route = manifest.routes[id];
        if (!route) continue;
        chunks.add(route.module);
        for (const chunk of route.imports ?? []) chunks.add(chunk);
      }
      return { route: leaf.id, chunks: [...chunks] };
    });
}

function formatKb(bytes: number): string {
  return `${(bytes / BYTES_PER_KB).toFixed(1)} kB`;
}

export function checkBudgets(routes: RouteSize[], limitKb: number): BudgetResult {
  const limitBytes = limitKb * BYTES_PER_KB;
  const failures = routes.filter((r) => r.gzipBytes > limitBytes);
  const lines = routes.map(
    (r) =>
      `${r.gzipBytes > limitBytes ? "FAIL" : "ok  "} ${r.route}: ${formatKb(r.gzipBytes)} gzipped (limit ${limitKb} kB)`,
  );
  return { ok: failures.length === 0, failures, report: lines.join("\n") };
}

/** Reads `budgets.js_initial_kb` from project.yaml text (two-space YAML, no dependency). */
export function readBudgetKb(projectYaml: string): number {
  let inBudgets = false;
  for (const line of projectYaml.split("\n")) {
    if (/^\S/.test(line)) inBudgets = /^budgets:\s*(#.*)?$/.test(line);
    const match = inBudgets ? /^ {2}js_initial_kb:\s*([^\s#]+)/.exec(line) : null;
    if (match) {
      const value = Number(match[1]);
      if (Number.isFinite(value) && value > 0) return value;
      throw new Error("project.yaml budgets.js_initial_kb must be a positive number");
    }
  }
  throw new Error("project.yaml has no budgets.js_initial_kb");
}
