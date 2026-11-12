import { CalendarCog, ChartColumn, ChevronRight, FileText, Images, type LucideIcon, Settings, UserRound, Users, UsersRound } from "lucide-react";
import { Form, Link, useNavigation } from "react-router";
import { AdminErrorBoundary } from "~/components/admin/admin-states";
import { SubmitButton } from "~/components/ui/submit-button";
import { t as translate } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import { requireAdmin } from "~/server/auth.server";
import type { Route } from "./+types/more";

/** `admin/more` (FR-047): the places that do not fit in the bottom bar. */
export const handle = { titleKey: "admin.nav.more" };

const EVERYONE = ["pages", "gallery", "customers", "sales", "profile"] as const;
const OWNER_ONLY = ["availability", "settings", "team"] as const;
type MoreKey = (typeof EVERYONE)[number] | (typeof OWNER_ONLY)[number];

/** Owner items only for Owners (`nav.ownerItems`); their pages also refuse Admins on the server (S-022). */
export async function loader(args: Route.LoaderArgs) {
  const me = await requireAdmin(args);
  const item = (key: MoreKey) => ({ key, href: `/admin/${key}`, label: translate(`admin.nav.${key}`, me.locale) });
  return {
    title: translate(handle.titleKey, me.locale),
    items: EVERYONE.map(item),
    ownerItems: me.role === "owner" ? OWNER_ONLY.map(item) : [],
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

export const ErrorBoundary = AdminErrorBoundary;

const ICONS: Record<MoreKey, LucideIcon> = {
  pages: FileText,
  gallery: Images,
  customers: Users,
  sales: ChartColumn,
  profile: UserRound,
  availability: CalendarCog,
  settings: Settings,
  team: UsersRound,
};

function MoreList({ items, label }: { items: { key: MoreKey; href: string; label: string }[]; label: string }) {
  return (
    <ul aria-label={label} className="mt-3 divide-y divide-border overflow-hidden rounded-card border border-border bg-card">
      {items.map(({ key, href, label: text }) => {
        const Icon = ICONS[key];
        return (
          <li key={key}>
            <Link to={href} prefetch="intent" className="flex min-h-14 items-center gap-3 px-4 py-2 font-semibold hover:bg-muted">
              <Icon aria-hidden="true" className="size-6 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">{text}</span>
              <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default function AdminMore({ loaderData }: Route.ComponentProps) {
  const { t } = useI18n();
  const navigation = useNavigation();
  const signingOut = navigation.state !== "idle" && navigation.formAction === "/admin/sign-out";
  return (
    <>
      <h1>{loaderData.title}</h1>
      <MoreList items={loaderData.items} label={loaderData.title} />
      {loaderData.ownerItems.length > 0 && (
        <section className="mt-8" aria-labelledby="owner-items">
          <h2 id="owner-items" className="text-lg">
            {t("admin.more.ownerSection")}
          </h2>
          <MoreList items={loaderData.ownerItems} label={t("admin.more.ownerSection")} />
        </section>
      )}
      <Form method="post" action="/admin/sign-out" className="mt-8">
        <SubmitButton pending={signingOut} pendingText={t("admin.shell.signingOut")} variant="outline" className="w-full">
          {t("admin.shell.signOut")}
        </SubmitButton>
      </Form>
    </>
  );
}
