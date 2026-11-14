import { useEffect, useRef } from "react";
import { Alert } from "~/components/ui/alert";
import { showToast } from "~/components/ui/toaster";
import { useI18n } from "~/i18n/react";

/** `past_date` and `sold_out` come from a manual order's save (E-07 S-134); an edit only sends the first three. */
export type EditWarning = "blocked" | "closed" | "too_soon" | "past_date" | "sold_out";
export const EDIT_WARNINGS: readonly EditWarning[] = ["blocked", "closed", "too_soon", "past_date", "sold_out"];

/**
 * After an edit (S-123 AC8): the toast "Order updated" and, when the new date breaks a rule, an
 * Alert (`role=status`) naming each warning in words. The save was never blocked; the Alert is
 * focusable so a keyboard user lands on it.
 */
export function EditedNotice({ edited, number }: { edited: { emailed: boolean; warnings: EditWarning[]; created?: boolean } | null; number?: string }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!edited) return;
    // A manual order just saved (E-07 S-131 AC1): "Order APB-0043 saved".
    if (edited.created) showToast(edited.emailed ? t("admin.orderNew.savedEmailed", { number: number ?? "" }) : t("admin.orderNew.saved", { number: number ?? "" }));
    else showToast(edited.emailed ? t("admin.orderEdit.updatedEmailed") : t("admin.orderEdit.updated"));
    if (edited.warnings.length > 0) ref.current?.focus();
  }, [edited, t, number]);
  if (!edited || edited.warnings.length === 0) return null;
  return (
    <Alert ref={ref} tone="warning" role="status" tabIndex={-1} title={edited.created ? t("admin.orderNew.savedWarningsTitle") : t("admin.orderEdit.warningsTitle")} className="mt-6 outline-offset-2" data-testid="edit-warnings">
      <ul className="grid gap-1">
        {edited.warnings.map((warning) => (
          <li key={warning}>{t(`admin.orderEdit.warning.${warning}`)}</li>
        ))}
      </ul>
    </Alert>
  );
}
