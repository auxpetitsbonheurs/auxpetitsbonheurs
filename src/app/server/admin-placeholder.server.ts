// Loaders and actions of admin destinations whose screens later epics build (S-022,
// S-033 AC7): guarded like any admin module, they show a neutral "Not available yet"
// page inside the frame. Each later story replaces its module's placeholder.
import { data } from "react-router";
import { t as translate } from "~/i18n/catalog.server";
import { type GuardArgs, requireAdmin } from "~/server/auth.server";

export type PlaceholderRole = "admin" | "owner";

const guard = (args: GuardArgs, role: PlaceholderRole) => requireAdmin(args, role === "owner" ? { role: "owner" } : {});

/** The page's title in the admin's language; Owner-only modules refuse an Admin with 403. */
export async function placeholderLoader(args: GuardArgs, titleKey: string, role: PlaceholderRole = "admin") {
  const me = await guard(args, role);
  return { title: translate(titleKey, me.locale) };
}

/** Nothing can be saved yet: after the guard, any post is 404 (so an Admin still gets 403 first). */
export async function placeholderAction(args: GuardArgs, role: PlaceholderRole = "admin"): Promise<never> {
  await guard(args, role);
  throw data(null, { status: 404 });
}
