import { redirect } from "react-router";
import { ManualOrderPage } from "~/components/admin/order-new/manual-order-page";
import { t as translate } from "~/i18n/catalog.server";
import type { Locale } from "~/lib/locale";
import { actionError } from "~/server/action-result.server";
import { requireAdmin } from "~/server/auth.server";
import { clockContext } from "~/server/clock.server";
import { problemField } from "~/server/contracts/order-edit";
import { ManualOrderInput } from "~/server/contracts/order-new";
import { requestDbContext } from "~/server/db.server";
import { loadMenu } from "~/server/menu.server";
import { publicConfigContext } from "~/server/public-config.server";
import { getSiteSettings, readSiteSettings } from "~/server/repos/settings.server";
import { noStore } from "~/server/response-headers.server";
import { createManualOrder } from "~/server/services/create-manual-order.server";
import { todayMU } from "~/domain/time";
import type { Route } from "./+types/order-new";

/** Names the page in the admin header (S-033 AC6). */
export const handle = { titleKey: "admin.nav.orders" };

/** A fresh idempotency key per render: never stored. */
export const middleware: Route.MiddlewareFunction[] = [noStore];

/**
 * `admin/order-new` loader (contracts.md, E-07 S-131): the menu (the same pricing as the server),
 * the windows, the Settings delivery fee, the public availability rules (warnings are worked out
 * in the form with `domain/manual-order`, the same rules `create` uses), today (Mauritius), a
 * fresh idempotency key, and the admin's language as the default confirmation language.
 */
export async function loader(args: Route.LoaderArgs) {
  const me = await requireAdmin(args);
  const db = args.context.get(requestDbContext).db;
  const clock = args.context.get(clockContext);
  const now = clock.now();
  const [settings, menu] = await Promise.all([getSiteSettings(db), loadMenu({ db, supabaseUrl: args.context.get(publicConfigContext).supabaseUrl, now, fixedClock: clock.fixed })]);
  return {
    title: translate("admin.orderNew.title", me.locale),
    idempotencyKey: crypto.randomUUID(),
    today: todayMU(now),
    nowMs: now.getTime(),
    menu: menu.data,
    windows: settings.checkout.windows,
    deliveryFeeRs: settings.checkout.deliveryFeeRs,
    availability: settings.availability,
    locale: me.locale,
  };
}

export type OrderNewLoaderData = Route.ComponentProps["loaderData"];

function fieldErrors(paths: (readonly PropertyKey[])[], locale: Locale, problems: Record<string, string> = {}): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const path of paths) {
    const field = problemField(path);
    const special = field === "date" && problems.date === "too_far" ? "admin.orderNew.problem.dateTooFar" : null;
    fields[field] ??= translate(special ?? (field === "lines" && problems.lines === "tooMany" ? "admin.orderNew.problem.tooMany" : `admin.orderForm.problem.${field}`), locale);
  }
  return fields;
}

async function create(args: Route.ActionArgs, locale: Locale, adminId: string, form: FormData) {
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("payload") ?? ""));
  } catch {
    return actionError("VALIDATION_FAILED", locale, { fields: { form: translate("admin.orderForm.problem.form", locale) }, extra: { intent: "create" } });
  }
  const input = ManualOrderInput.safeParse(raw);
  if (!input.success) {
    const tooMany = input.error.issues.some((issue) => issue.path[0] === "lines" && issue.code === "too_big");
    return actionError("VALIDATION_FAILED", locale, { fields: fieldErrors(input.error.issues.map((i) => i.path), locale, tooMany ? { lines: "tooMany" } : {}), extra: { intent: "create" } });
  }
  const db = args.context.get(requestDbContext).db;
  const clock = args.context.get(clockContext);
  const now = clock.now();
  // Fresh Settings and menu: the save decides with what is true now, not a cached copy.
  const [settings, menu] = await Promise.all([readSiteSettings(db), loadMenu({ db, supabaseUrl: args.context.get(publicConfigContext).supabaseUrl, now, fixedClock: clock.fixed })]);
  const result = await createManualOrder(db, { adminId, now, input: input.data, menu: menu.data, windows: settings.checkout.windows, availability: settings.availability });
  if (result.ok) {
    const query = new URLSearchParams({ created: "1", emailed: result.emailed ? "1" : "0" });
    if (result.warnings.length > 0) query.set("warnings", result.warnings.join(","));
    throw redirect(`/admin/orders/${result.orderId}?${query.toString()}`);
  }
  if (result.code === "PRODUCT_UNAVAILABLE") return actionError("PRODUCT_UNAVAILABLE", locale, { extra: { intent: "create", names: result.names } });
  return actionError("VALIDATION_FAILED", locale, { fields: fieldErrors(Object.keys(result.fields).map((f) => f.split(".")), locale, result.fields), extra: { intent: "create" } });
}

/** `create { payload: JSON }` → redirect to the order (S-131..S-135); `findCustomer` is `POST /admin/customer-lookup`. */
export async function action(args: Route.ActionArgs) {
  const me = await requireAdmin(args);
  const form = await args.request.formData();
  const intent = form.get("intent");
  if (intent === "create") return create(args, me.locale, me.id, form);
  return actionError("VALIDATION_FAILED", me.locale);
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

export default function AdminOrderNew({ loaderData }: Route.ComponentProps) {
  return <ManualOrderPage data={loaderData} />;
}
