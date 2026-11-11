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

/** The load script creates real orders: only staging or a local build may be targeted. */
export function assertMeasurableTarget(base: string): void {
  const host = new URL(base).hostname;
  if (host === "localhost" || host === "127.0.0.1" || host.includes("staging")) return;
  throw new Error("cpu:load only runs against staging or a local build (it places orders)");
}
