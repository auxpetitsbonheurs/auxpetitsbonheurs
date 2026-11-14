import { useEffect, useRef } from "react";
import { Alert } from "~/components/ui/alert";
import { showToast } from "~/components/ui/toaster";
import { useI18n } from "~/i18n/react";

export type EditWarning = "blocked" | "closed" | "too_soon";
export const EDIT_WARNINGS: readonly EditWarning[] = ["blocked", "closed", "too_soon"];

/**
 * After an edit (S-123 AC8): the toast "Order updated" and, when the new date breaks a rule, an
 * Alert (`role=status`) naming each warning in words. The save was never blocked; the Alert is
 * focusable so a keyboard user lands on it.
 */
export function EditedNotice({ edited }: { edited: { emailed: boolean; warnings: EditWarning[] } | null }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!edited) return;
    showToast(edited.emailed ? t("admin.orderEdit.updatedEmailed") : t("admin.orderEdit.updated"));
    if (edited.warnings.length > 0) ref.current?.focus();
  }, [edited, t]);
  if (!edited || edited.warnings.length === 0) return null;
  return (
    <Alert ref={ref} tone="warning" role="status" tabIndex={-1} title={t("admin.orderEdit.warningsTitle")} className="mt-6 outline-offset-2" data-testid="edit-warnings">
      <ul className="grid gap-1">
        {edited.warnings.map((warning) => (
          <li key={warning}>{t(`admin.orderEdit.warning.${warning}`)}</li>
        ))}
      </ul>
    </Alert>
  );
}
