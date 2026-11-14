import { data } from "react-router";
import { adminMiddleware } from "~/server/admin-page.server";
import { actionError } from "~/server/action-result.server";
import { requireAdmin } from "~/server/auth.server";
import { FindCustomerInput } from "~/server/contracts/order-new";
import { requestDbContext } from "~/server/db.server";
import { findMatchingCustomer } from "~/server/repos/customer-match.server";
import type { Route } from "./+types/customer-lookup";

/**
 * `findCustomer` of `admin/order-new` (POST /admin/customer-lookup, contracts.md, E-07 S-133): a
 * JSON resource route, so the Add order form can call it with `fetch` and say "Could not search,
 * you can still continue." when the network fails, without leaving the form. Admin session
 * required (customer → FORBIDDEN JSON, anonymous → login redirect); `private, no-store`.
 */
export const middleware: Route.MiddlewareFunction[] = adminMiddleware;

export async function loader(args: Route.LoaderArgs) {
  await requireAdmin(args);
  throw data(null, { status: 404 });
}

type Envelope = { data: unknown; init: ResponseInit | null };
const isEnvelope = (value: unknown): value is Envelope => typeof value === "object" && value !== null && (value as { type?: unknown }).type === "DataWithResponseInit";

function asJson(value: unknown): Response {
  if (value instanceof Response) return value;
  if (isEnvelope(value)) return Response.json(value.data, value.init ?? {});
  return Response.json(value);
}

/** `{ phone?, email? }` (at least one) → `{ ok, customer: { id, name, phone, email, locale, orderCount } | null, conflict }`. */
export async function action(args: Route.ActionArgs) {
  let me;
  try {
    me = await requireAdmin(args);
  } catch (refusal) {
    if (refusal instanceof Response || isEnvelope(refusal)) throw asJson(refusal);
    throw refusal;
  }
  const form = await args.request.formData();
  const input = FindCustomerInput.safeParse({ phone: form.get("phone") ?? undefined, email: form.get("email") ?? undefined });
  if (!input.success) return asJson(actionError("VALIDATION_FAILED", me.locale));
  const match = await findMatchingCustomer(args.context.get(requestDbContext).db, input.data);
  console.log(JSON.stringify({ level: "info", event: "customer_lookup", matched: match.customer !== null }));
  return asJson({ ok: true, customer: match.customer, conflict: match.conflict });
}
