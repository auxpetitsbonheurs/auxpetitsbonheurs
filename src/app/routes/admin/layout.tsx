import { type ReactNode, useEffect, useState } from "react";
import { Outlet, isRouteErrorResponse, useLocation, useMatches, useNavigation } from "react-router";
import { AdminHeader } from "~/components/admin/admin-header";
import { AdminBottomBar } from "~/components/admin/bottom-bar";
import { InstallBanner } from "~/components/admin/install-banner";
import { MenuSkeleton, ProductFormSkeleton, TeamSkeleton } from "~/components/admin/menu-skeleton";
import { NavProgress } from "~/components/shell/nav-progress";
import { SkipLink } from "~/components/shell/skip-link";
import { Toaster } from "~/components/ui/toaster";
import { useI18n } from "~/i18n/react";
import { ADMIN_THEME } from "~/lib/admin-manifest";
import { adminMiddleware } from "~/server/admin-page.server";
import { requireAdmin } from "~/server/auth.server";
import { requestDbContext } from "~/server/db.server";
import { countReviewOrders } from "~/server/repos/admin-orders.server";
import { timed } from "~/server/server-timing.server";
import type { Route } from "./+types/layout";

export const middleware: Route.MiddlewareFunction[] = adminMiddleware;

/** The installable admin app (S-035): its manifest and the iOS home-screen icon. */
export const links: Route.LinksFunction = () => [
  { rel: "manifest", href: "/admin/manifest.webmanifest" },
  { rel: "apple-touch-icon", href: "/admin/apple-touch-icon.png" },
];

/**
 * `admin/layout` loader (contracts.md v0.14): `me`, `nav.ownerItems` (More shows
 * Availability, Settings, Team), `badges.toReview` (S-034: orders waiting for review, one
 * indexed count; no `shouldRevalidate` here, so it follows an Approve) and `vapidPublicKey`
 * (null until push, E-10). The guard here protects the frame's own data only; every child
 * loader and action calls `requireAdmin` itself (S-009 AC4).
 */
export async function loader(args: Route.LoaderArgs) {
  const me = await requireAdmin(args);
  const toReview = await timed(args.context, "badges", () => countReviewOrders(args.context.get(requestDbContext).db));
  return {
    me: { id: me.id, name: me.name, role: me.role, locale: me.locale },
    nav: { ownerItems: me.role === "owner" },
    badges: { toReview },
    vapidPublicKey: null,
  };
}

type LayoutData = Awaited<ReturnType<typeof loader>>;
/** The frame's last good data in this tab, kept for a failed reload (below). */
let lastFrame: LayoutData | undefined;

/**
 * The frame stays when the network or server fails during a navigation: the frame's data
 * falls back to what this tab last had, so the page's own boundary shows its error with
 * Retry inside the frame (S-041 AC3). Redirects and 4xx refusals (sign-in, 403) still apply.
 */
export async function clientLoader({ serverLoader }: Route.ClientLoaderArgs): Promise<LayoutData> {
  try {
    lastFrame = await serverLoader();
    return lastFrame;
  } catch (error) {
    if (!lastFrame || !isServerOrNetworkFailure(error)) throw error;
    return lastFrame;
  }
}

/** No response, or a 5xx one; never a redirect or a 4xx refusal (sign-in, 403, 404). */
function isServerOrNetworkFailure(error: unknown): boolean {
  if (error instanceof Response) return error.status >= 500;
  if (isRouteErrorResponse(error)) return error.status >= 500;
  return true;
}

/** The server-rendered first page seeds the fallback too. */
function rememberFrame(data: LayoutData): void {
  lastFrame = data;
}

/** The deepest page's `handle.titleKey` (each admin page names itself for the header). */
function usePageTitleKey(): string | undefined {
  const matches = useMatches();
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const key = (matches[i]!.handle as { titleKey?: unknown } | undefined)?.titleKey;
    if (typeof key === "string") return key;
  }
  return undefined;
}

/** Skeletons stand in for a page only when its data takes longer than this (design-system "Loading"). */
export const SKELETON_DELAY_MS = 300;

/** Pages with a skeleton of their own: shown while a navigation to them is slow (S-041 AC3). */
const SKELETONS: [RegExp, () => ReactNode][] = [
  [/^\/admin\/menu$/, () => <MenuSkeleton />],
  [/^\/admin\/menu\/[^/]+$/, () => <ProductFormSkeleton />],
  [/^\/admin\/profile$/, () => <ProductFormSkeleton labelKey="admin.profile.loading" />],
  [/^\/admin\/team$/, () => <TeamSkeleton />],
];

const skeletonFor = (path: string) => SKELETONS.find(([pattern]) => pattern.test(path))?.[1];

/** The skeleton of the page being opened, once its data has taken longer than 300 ms; else null. */
function usePendingSkeleton(): ReactNode {
  const navigation = useNavigation();
  const { pathname } = useLocation();
  const target = navigation.state === "loading" && !navigation.formMethod ? navigation.location?.pathname : undefined;
  const pending = target && target !== pathname && skeletonFor(target) ? target : undefined;
  const [late, setLate] = useState<string | undefined>();
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setLate(pending), SKELETON_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pending]);
  return pending && late === pending ? skeletonFor(pending)!() : null;
}

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  const { t } = useI18n();
  const titleKey = usePageTitleKey();
  const skeleton = usePendingSkeleton();
  useEffect(() => rememberFrame(loaderData), [loaderData]);
  return (
    <div data-admin-frame="" className="flex min-h-dvh flex-col">
      {/* React hoists these into <head>: the installed app's bar follows the theme (tokens surface). */}
      <meta name="theme-color" media="(prefers-color-scheme: light)" content={ADMIN_THEME.light.surface} />
      <meta name="theme-color" media="(prefers-color-scheme: dark)" content={ADMIN_THEME.dark.surface} />
      <meta name="apple-mobile-web-app-title" content="Petits bonheurs" />
      <SkipLink />
      <NavProgress />
      <AdminHeader me={loaderData.me} title={titleKey ? t(titleKey) : undefined} />
      {/* Before main in the DOM so the skip link jumps past it; fixed to the bottom on phones. */}
      <AdminBottomBar toReview={loaderData.badges.toReview} />
      {/* tabIndex lets the skip link move focus here; not a control, so no ring. Bottom padding keeps content above the bar. */}
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-content flex-1 px-4 pt-6 pb-6 outline-none min-[20rem]:pb-[calc(5rem+env(safe-area-inset-bottom))] md:px-6"
      >
        <InstallBanner />
        {skeleton ?? <Outlet />}
      </main>
      <Toaster />
    </div>
  );
}
