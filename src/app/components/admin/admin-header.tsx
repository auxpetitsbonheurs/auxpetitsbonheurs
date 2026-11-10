import { Form } from "react-router";
import { Button } from "~/components/ui/button";
import { useI18n } from "~/i18n/react";

export interface AdminHeaderProps {
  /** The signed-in admin; absent on the sign-in page. */
  me?: { name: string; role: "owner" | "admin" };
}

/** Top header of the admin app (admin-access-team "Shell"): brand, who is signed in, Sign out. */
export function AdminHeader({ me }: AdminHeaderProps) {
  const { t } = useI18n();
  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex w-full max-w-content flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 md:px-6">
        <p className="min-w-0">
          <a href={me ? "/admin" : "/admin/login"} className="inline-flex min-h-11 flex-col justify-center font-display text-lg font-semibold">
            <span>{t("admin.shell.brand")}</span>
            <span className="text-sm font-normal text-muted-foreground">{t("admin.shell.area")}</span>
          </a>
        </p>
        {me && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-sm">
              {t("admin.shell.signedInAs", { name: me.name })} · {t(`admin.shell.role.${me.role}`)}
            </p>
            <Form method="post" action="/admin/sign-out">
              <Button type="submit" variant="outline" size="sm">
                {t("admin.shell.signOut")}
              </Button>
            </Form>
          </div>
        )}
      </div>
    </header>
  );
}
