import { useI18n } from "~/i18n/react";

/** Placeholder rows with the loaded rows' box sizes (CLS), shown while the menu loads (S-041 AC3). */
export function MenuSkeleton() {
  const { t } = useI18n();
  return (
    <div aria-busy="true" data-testid="menu-skeleton">
      <p role="status" className="sr-only">
        {t("admin.menu.loading")}
      </p>
      <div aria-hidden="true">
        <div className="h-10 w-40 rounded-md bg-muted" />
        {[0, 1].map((group) => (
          <div key={group} className="mt-8">
            <div className="h-8 w-32 rounded-md bg-muted" />
            <ul className="mt-3 divide-y divide-border overflow-hidden rounded-card border border-border bg-card">
              {[0, 1, 2].map((row) => (
                <li key={row} className="flex min-h-20 items-center gap-3 p-3">
                  <div className="size-14 shrink-0 rounded-md bg-muted" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-4 w-3/4 rounded bg-muted" />
                    <div className="h-4 w-1/3 rounded bg-muted" />
                  </div>
                  <div className="size-11 shrink-0 rounded-md bg-muted" />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
