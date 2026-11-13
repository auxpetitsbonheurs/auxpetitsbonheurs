// Helpers for the staging CPU load script (S-019, scripts/cpu-load.ts): read the server-
// rendered forms (no JS needed) and build the order a measured submit posts. Pure.

export type Phase = "cold" | "warm";

function inputTag(html: string, name: string, type?: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tags = html.match(new RegExp(`<input\\b[^>]*\\bname="${escaped}"[^>]*>`, "g")) ?? [];
  return tags.find((tag) => !type || new RegExp(`\\btype="${type}"`).test(tag));
}

/** The `value` of the first `<input name=…>` (optionally of one type), or undefined. */
export function inputValue(html: string, name: string, type?: string): string | undefined {
  return inputTag(html, name, type)?.match(/\bvalue="([^"]*)"/)?.[1];
}

/** `name=value` of a cookie from a response's Set-Cookie headers, for the next request. */
export function cookiePair(setCookies: readonly string[], name: string): string | undefined {
  return setCookies.map((c) => c.split(";")[0]!.trim()).find((pair) => pair.startsWith(`${name}=`));
}

/** Adds the `?cpu=<phase>` tag the report uses to pick measured requests out of the logs. */
export function tagged(base: string, path: string, phase: Phase): string {
  const url = new URL(path, base);
  url.searchParams.set("cpu", phase);
  return url.toString();
}

/** The tracking token from the submit redirect (`/order/<token>/confirmed`, either language). */
export function tokenFromLocation(location: string | null): string | undefined {
  return location?.match(/\/order\/([^/?#]+)\/confirmed/)?.[1];
}

export interface OrderFormInput {
  basketHtml: string;
  date: string;
  runId: string;
  index: number;
}

/** Marks every order the measurement creates as test data the Owner can ignore. */
export const TEST_ORDER_NAME = "CPU test — ignore";
/** A well-formed but unassigned-looking Mauritian mobile number: never a real customer. */
export const TEST_ORDER_PHONE = "50000000";

/**
 * A pickup order as the no-JS form posts it; each submit has its own idempotency key and email.
 * Contact details are fake (example.com, a placeholder phone) and the name and note say it is a test.
 */
export function orderForm({ basketHtml, date, runId, index }: OrderFormInput): URLSearchParams {
  const fields: Record<string, string | undefined> = {
    intent: "placeOrder",
    idempotencyKey: inputValue(basketHtml, "idempotencyKey"),
    fulfilment: "pickup",
    date,
    "windowId.pickup": inputValue(basketHtml, "windowId.pickup", "radio"),
    "displayedTotalRs.pickup": inputValue(basketHtml, "displayedTotalRs.pickup"),
    "contact.name": `${TEST_ORDER_NAME} ${index + 1}`,
    "contact.phone": TEST_ORDER_PHONE,
    "contact.email": `cpu-test+${runId}-${index + 1}@example.com`,
    "contact.note": `Automated CPU measurement (S-019), run ${runId}. Not a real order.`,
    acceptPolicies: "on",
  };
  const missing = Object.entries(fields).filter(([, value]) => !value).map(([name]) => name);
  if (missing.length > 0) throw new Error(`Basket page is missing ${missing.join(", ")}: is the sample product seeded and orderable?`);
  return new URLSearchParams(fields as Record<string, string>);
}

/** The parts of an `/api/menu` product the line plan reads. */
export interface PlanProduct {
  id: string;
  type: string;
  status: string;
  minQuantity: number | null;
  optionGroups: readonly {
    id: string;
    kind: string;
    required: boolean;
    quantityMin: number | null;
    textMaxLength: number | null;
    choices: readonly { id: string }[];
  }[];
}

export interface PlannedLine {
  /** The product page form an add-to-basket posts (no JavaScript). */
  fields: URLSearchParams;
}

const MAX_VARIANTS_PER_PRODUCT = 50;

/** Variant `v` of a product as add-to-basket fields: required groups filled, text made unique where allowed. */
function lineFields(product: PlanProduct, v: number): URLSearchParams {
  const fields = new URLSearchParams({ intent: "addToBasket", productId: product.id, quantity: String(Math.max(1, product.minQuantity ?? 1)) });
  const label = `CPU line ${v + 1}`;
  let cycle = v;
  for (const group of product.optionGroups) {
    if (group.kind === "text") {
      if (group.required || v > 0) fields.set(`optionText.${group.id}`, label.slice(0, group.textMaxLength ?? label.length));
    } else if (group.kind === "quantity") {
      if (group.required) fields.set(`optionQty.${group.id}`, String(Math.max(1, group.quantityMin ?? 1)));
    } else if (group.choices.length > 0) {
      const size = group.required ? group.choices.length : 2; // optional: without, then with the first choice
      const pick = cycle % size;
      cycle = Math.floor(cycle / size);
      if (group.required) fields.set(`option.${group.id}`, group.choices[pick]!.id);
      else if (pick === 1) fields.append(`option.${group.id}`, group.choices[0]!.id);
    }
  }
  // Cakes take a message unless they have their own text option: it makes every cake line distinct.
  if (product.type === "cake" && !product.optionGroups.some((g) => g.kind === "text") && v > 0) fields.set("cakeMessage", label);
  return fields;
}

/**
 * S-097 AC1: `count` distinct basket lines from the menu's orderable products, taken in turn,
 * each with its required options set (a distinct choice, add-on or cake message per line, so the
 * basket keeps them as separate lines instead of merging them).
 */
export function basketLinePlan(products: readonly PlanProduct[], count: number): PlannedLine[] {
  const orderable = products.filter((p) => p.status === "available");
  if (orderable.length === 0) throw new Error("No orderable product on the menu");
  const seen = new Set<string>();
  const plan: PlannedLine[] = [];
  for (let v = 0; v < MAX_VARIANTS_PER_PRODUCT && plan.length < count; v += 1) {
    for (const product of orderable) {
      if (plan.length >= count) break;
      const fields = lineFields(product, v);
      const key = fields.toString();
      if (seen.has(key)) continue;
      seen.add(key);
      plan.push({ fields });
    }
  }
  if (plan.length < count) throw new Error(`Only ${plan.length} distinct lines are orderable on this menu`);
  return plan;
}

/** The load script creates real orders: only staging or a local build may be targeted. */
export function assertMeasurableTarget(base: string): void {
  const host = new URL(base).hostname;
  if (host === "localhost" || host === "127.0.0.1" || host.includes("staging")) return;
  throw new Error("cpu:load only runs against staging or a local build (it places orders)");
}
