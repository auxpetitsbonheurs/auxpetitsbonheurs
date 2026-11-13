// S-115 AC8: the table in code and PRD Appendix B agree, so drift fails CI. Every admin row of
// Appendix B must be an admin rule, every customer row a customer rule, and every rule must be
// covered by a row (Back one step and the re-quote are the Rules' own lines, not table rows).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { ADMIN_ACTIONS, CUSTOMER_ACTIONS, adminRules, customerRules } from "./order-transitions";
import type { OrderStatus } from "./status";

const PRD = readFileSync(resolve(__dirname, "../../../docs/product/prd.md"), "utf8");

const NAMES: Record<string, OrderStatus[]> = {
  "awaiting payment": ["awaiting_payment"],
  "approved / in preparation": ["approved", "in_preparation"],
  "pending approval": ["pending_approval"],
  approved: ["approved"],
  declined: ["declined"],
  cancelled: ["cancelled"],
  "quote needed": ["quote_needed"],
  "quote sent": ["quote_sent"],
  closed: ["closed"],
  "in preparation": ["in_preparation"],
  "ready for pickup / out for delivery": ["ready_for_pickup", "out_for_delivery"],
  "ready / out for delivery": ["ready_for_pickup", "out_for_delivery"],
  completed: ["completed"],
  "approved or later (not completed)": ["approved", "in_preparation", "ready_for_pickup", "out_for_delivery"],
};

interface Row {
  from: OrderStatus[];
  to: OrderStatus[];
  who: string;
}

function appendixRows(): Row[] {
  const section = PRD.split("## Appendix B")[1]!.split("\n## ")[0]!;
  return section
    .split("\n")
    .filter((line) => line.startsWith("| ") && !line.startsWith("| From") && !line.startsWith("|---"))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
    .filter(([from]) => !from!.startsWith("("))
    .map(([from, to, who]) => {
      const fromKey = from!.toLowerCase();
      const toKey = to!.toLowerCase();
      if (!NAMES[fromKey] || !NAMES[toKey]) throw new Error(`Appendix B row not understood: ${from} -> ${to}`);
      return { from: NAMES[fromKey], to: NAMES[toKey], who: who!.toLowerCase() };
    });
}

const pair = (from: OrderStatus, to: OrderStatus) => `${from}->${to}`;
const adminPairs = new Set(ADMIN_ACTIONS.flatMap((a) => adminRules(a).map((r) => pair(r.from, r.to))));
const customerPairs = new Set(CUSTOMER_ACTIONS.flatMap((a) => customerRules(a).map((r) => pair(r.from, r.to))));

/** Transitions a row allows: one-to-one for "Ready / Out" lists, cross product otherwise. */
function rowPairs(row: Row): string[] {
  if (row.from.length === row.to.length && row.from.length > 1) return row.from.map((from, i) => pair(from, row.to[i]!));
  return row.from.flatMap((from) => row.to.map((to) => pair(from, to)));
}

describe("PRD Appendix B and the code agree (S-115 AC8)", () => {
  const rows = appendixRows();

  test("the appendix is parsed", () => {
    expect(rows.length).toBeGreaterThanOrEqual(12);
  });

  test("every admin row is an admin rule and every customer row a customer rule", () => {
    for (const row of rows) {
      for (const p of rowPairs(row)) {
        if (row.who.includes("admin")) expect(adminPairs, `admin ${p}`).toContain(p);
        if (row.who.includes("customer") || row.who.includes("expires")) expect(customerPairs, `customer ${p}`).toContain(p);
      }
    }
  });

  test("every forward rule in code has its row; Back one step and re-quote are the Rules' lines", () => {
    const documented = new Set(rows.flatMap(rowPairs));
    const steppedBack = new Set([...adminRules("revert"), ...adminRules("undoPaid")].map((r) => pair(r.from, r.to)));
    for (const p of [...adminPairs, ...customerPairs]) {
      if (steppedBack.has(p) || p === pair("quote_sent", "quote_sent")) continue;
      expect(documented, p).toContain(p);
    }
    expect(PRD).toMatch(/Back one step by an admin sends no email/);
    expect(PRD).toMatch(/Undo of Payment received/);
  });
});
