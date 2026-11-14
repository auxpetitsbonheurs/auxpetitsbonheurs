import { useI18n } from "~/i18n/react";
import type { PrepLoaderData } from "~/routes/admin/calendar-prep";

/**
 * The prep groups (S-139 AC5, AC6, AC11): a real heading per product, a list per variant, the
 * quantity as text ("2 ×"), every message in full as a quoted line (wraps, never truncated).
 * Print: black on white, a group never split across pages (S-140 AC4, `app.css`).
 */
export function PrepGroups({ groups }: { groups: PrepLoaderData["groups"] }) {
  const { t } = useI18n();
  return (
    <div className="grid gap-4">
      {groups.map((group, index) => {
        const id = `prep-group-${index}`;
        return (
          <section key={group.product} aria-labelledby={id} className="prep-group rounded-card border border-border bg-card p-3">
            <h2 id={id} className="text-xl wrap-anywhere">
              {group.product}
            </h2>
            <ul className="mt-2 grid gap-3" aria-labelledby={id}>
              {group.variants.map((variant) => (
                <li key={variant.label} className="grid gap-1">
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-lg font-bold whitespace-nowrap tabular-nums">{t("admin.prep.quantity", { count: variant.quantity })}</span>
                    {variant.label && <span className="text-lg font-semibold wrap-anywhere">{variant.label}</span>}
                    <span className="text-sm">{t("admin.prep.orderCount", { count: variant.orderCount })}</span>
                  </p>
                  {variant.messages.length > 0 && (
                    <ul aria-label={t("admin.prep.messagesLabel")} className="grid gap-1 border-l-4 border-border pl-3">
                      {variant.messages.map((message, i) => (
                        <li key={i}>
                          <q className="whitespace-pre-wrap wrap-anywhere">{message}</q>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
