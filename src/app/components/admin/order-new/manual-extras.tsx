import { FormSection, Field, inputClass } from "~/components/admin/order-form/fields";
import { useI18n } from "~/i18n/react";
import type { Locale } from "~/lib/locale";

const ADMIN_NOTE_MAX = 2000;

/**
 * The manual order's own fields (S-132 AC8, S-135 AC4, AC7): Paid (a native switch covering the
 * whole 44 px row, its state in words), the confirmation language (a labelled native select) and
 * the private admin note with its counter.
 */
export function ManualExtras(props: { paid: boolean; onPaid: (paid: boolean) => void; locale: Locale; onLocale: (locale: Locale) => void; adminNote: string; onAdminNote: (note: string) => void }) {
  const { t } = useI18n();
  return (
    <FormSection id="manual-heading" title={t("admin.orderNew.extrasTitle")}>
      <label className="relative mt-3 flex min-h-12 cursor-pointer items-center gap-3 rounded-md border-2 border-input bg-card px-3 font-semibold has-checked:border-primary">
        <input type="checkbox" role="switch" checked={props.paid} onChange={(e) => props.onPaid(e.target.checked)} aria-describedby="paid-hint" className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-md" />
        <span aria-hidden="true" className="relative h-6 w-10 shrink-0 rounded-full border-2 border-input bg-muted after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-foreground peer-checked:border-primary peer-checked:bg-primary peer-checked:after:left-[1.1rem] peer-checked:after:bg-primary-foreground" />
        <span>
          {t("admin.orderNew.paid")} <span className="font-normal">({props.paid ? t("admin.orderNew.paidOn") : t("admin.orderNew.paidOff")})</span>
        </span>
      </label>
      <p id="paid-hint" className="mt-1 text-sm">
        {t("admin.orderNew.paidHint")}
      </p>
      <Field id="orderLocale" label={t("admin.orderNew.language")}>
        <p id="orderLocale-hint" className="text-sm">
          {t("admin.orderNew.languageHint")}
        </p>
        <select id="orderLocale" value={props.locale} aria-describedby="orderLocale-hint" onChange={(e) => props.onLocale(e.target.value as Locale)} className={inputClass}>
          <option value="en">English</option>
          <option value="fr">Français</option>
        </select>
      </Field>
      <Field id="adminNote" label={t("admin.orderNew.adminNote")}>
        <p id="adminNote-hint" className="text-sm">
          {t("admin.orderNew.adminNoteHint", { count: props.adminNote.length, max: ADMIN_NOTE_MAX })}
        </p>
        <textarea id="adminNote" rows={3} maxLength={ADMIN_NOTE_MAX} aria-describedby="adminNote-hint" value={props.adminNote} onChange={(e) => props.onAdminNote(e.target.value)} className={inputClass} />
      </Field>
    </FormSection>
  );
}
