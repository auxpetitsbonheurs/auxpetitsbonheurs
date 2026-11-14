import { Link } from "react-router";
import { useI18n } from "~/i18n/react";
import { badgeImage } from "~/lib/brand";

const adminBadge = badgeImage("burgundy", 48);

export interface AdminHeaderProps {
  /** The signed-in admin; absent on the sign-in page. */
  me?: { name: string; role: "owner" | "admin" };
  /** The current page's name (S-033 AC6), shown under the brand when signed in. */
  title?: string;
}

/**
 * Top header of the admin app (admin-access-team "Shell"): brand, the page title and who
 * is signed in with their role as text (S-033 AC6). Read-only, per design-system "Thumb
 * zone": places and Sign out live at the bottom (bottom bar, More).
 */
export function AdminHeader({ me, title }: AdminHeaderProps) {
  const { t } = useI18n();
  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex w-full max-w-content flex-wrap items-end justify-between gap-x-4 px-4 py-2 md:px-6">
        {me ? (
          <>
            <div className="min-w-0">
              <Link to="/admin" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
                {/* Small logo mark (burgundy badge on the light header); decorative next to the brand text. */}
                <img {...adminBadge} sizes="32px" alt="" width={32} height={32} className="size-8" />
                {t("admin.shell.brand")}
              </Link>
              {title && <p className="font-display text-xl leading-tight">{title}</p>}
            </div>
            <p className="text-sm">
              {t("admin.shell.signedInAs", { name: me.name })} · {t(`admin.shell.role.${me.role}`)}
            </p>
          </>
        ) : (
          <p className="min-w-0">
            <a href="/admin/login" className="inline-flex min-h-11 items-center gap-3">
              <img {...adminBadge} sizes="48px" alt="" width={48} height={48} className="size-12" />
              <span className="flex flex-col justify-center font-display text-xl">
                <span>{t("admin.shell.brand")}</span>
                <span className="font-sans text-sm text-muted-foreground">{t("admin.shell.area")}</span>
              </span>
            </a>
          </p>
        )}
      </div>
    </header>
  );
}
