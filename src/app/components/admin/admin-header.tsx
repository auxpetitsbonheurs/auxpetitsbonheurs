import { Form, Link, useNavigation } from "react-router";
import { SubmitButton } from "~/components/ui/submit-button";
import { useI18n } from "~/i18n/react";

export interface AdminHeaderProps {
  /** The signed-in admin; absent on the sign-in page. */
  me?: { name: string; role: "owner" | "admin" };
  /** The current page's name (S-033 AC6), shown under the brand when signed in. */
  title?: string;
}

/**
 * Top header of the admin app (admin-access-team "Shell"): brand, the page title, who is
 * signed in with their role as text (S-033 AC6), and Sign out. Read-only otherwise: the
 * places to go live in the bottom bar (thumb zone).
 */
export function AdminHeader({ me, title }: AdminHeaderProps) {
  const { t } = useI18n();
  const navigation = useNavigation();
  const signingOut = navigation.state !== "idle" && navigation.formAction === "/admin/sign-out";
  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex w-full max-w-content flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 md:px-6">
        {me ? (
          <div className="min-w-0">
            <Link to="/admin" className="inline-flex min-h-11 items-center text-sm text-muted-foreground">
              {t("admin.shell.brand")}
            </Link>
            {title && <p className="font-display text-xl leading-tight">{title}</p>}
          </div>
        ) : (
          <p className="min-w-0">
            <a href="/admin/login" className="inline-flex min-h-11 flex-col justify-center font-display text-xl">
              <span>{t("admin.shell.brand")}</span>
              <span className="font-sans text-sm text-muted-foreground">{t("admin.shell.area")}</span>
            </a>
          </p>
        )}
        {me && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-sm">
              {t("admin.shell.signedInAs", { name: me.name })} · {t(`admin.shell.role.${me.role}`)}
            </p>
            <Form method="post" action="/admin/sign-out">
              <SubmitButton pending={signingOut} pendingText={t("admin.shell.signingOut")} variant="outline" size="sm">
                {t("admin.shell.signOut")}
              </SubmitButton>
            </Form>
          </div>
        )}
      </div>
    </header>
  );
}
