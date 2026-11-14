import type { TimeWindow } from "~/db/schema";
import { RadioCard } from "~/components/ui/radio-card";
import { localized } from "~/i18n/localized";
import { useI18n } from "~/i18n/react";
import { formatRupees } from "~/lib/locale";
import { Field, FormSection, inputClass, invalidProps } from "./fields";
import type { FormContact, FormFulfilment } from "./model";

type Errors = Record<string, string>;

/** Delivery or pickup, date, window, address, landmark and fee (S-122 AC4; manual orders FR-055). */
export function FulfilmentFields({ value, windows, errors, onChange }: { value: FormFulfilment; windows: { delivery: TimeWindow[]; pickup: TimeWindow[] }; errors: Errors; onChange: (next: FormFulfilment) => void }) {
  const { t, locale } = useI18n();
  const set = (patch: Partial<FormFulfilment>) => onChange({ ...value, ...patch });
  const choices = windows[value.fulfilment];
  return (
    <FormSection id="fulfilment-heading" title={t("admin.orderForm.fulfilmentTitle")}>
      <fieldset className="mt-3">
        <legend className="sr-only">{t("admin.orderForm.fulfilmentTitle")}</legend>
        <div className="grid gap-2 min-[24rem]:grid-cols-2" onChange={(e) => set({ fulfilment: (e.target as HTMLInputElement).value as FormFulfilment["fulfilment"] })}>
          <RadioCard id="form-delivery" name="fulfilment" value="delivery" title={t("admin.orderForm.delivery")} defaultChecked={value.fulfilment === "delivery"} />
          <RadioCard id="form-pickup" name="fulfilment" value="pickup" title={t("admin.orderForm.pickup")} defaultChecked={value.fulfilment === "pickup"} />
        </div>
      </fieldset>
      <Field id="date" label={t("admin.orderForm.date")} error={errors.date}>
        <input id="date" type="date" value={value.date} onChange={(e) => set({ date: e.target.value })} className={inputClass} {...invalidProps("date", errors.date)} />
      </Field>
      <Field id="windowId" label={t("admin.orderForm.window")} error={errors.windowId}>
        <select id="windowId" value={value.windowId} onChange={(e) => set({ windowId: e.target.value })} className={inputClass} {...invalidProps("windowId", errors.windowId)}>
          {!choices.some((w) => w.id === value.windowId) && <option value={value.windowId}>{value.windowId}</option>}
          {choices.map((w) => (
            <option key={w.id} value={w.id}>
              {t("checkout.windowLabel", { label: localized(w.label, locale), start: w.start, end: w.end })}
            </option>
          ))}
        </select>
      </Field>
      {value.fulfilment === "delivery" && (
        <>
          <Field id="address" label={t("admin.orderForm.address")} error={errors.address}>
            <textarea id="address" rows={2} value={value.address} onChange={(e) => set({ address: e.target.value })} className={inputClass} {...invalidProps("address", errors.address)} />
          </Field>
          <Field id="landmark" label={t("admin.orderForm.landmark")}>
            <input id="landmark" value={value.landmark} onChange={(e) => set({ landmark: e.target.value })} className={inputClass} />
          </Field>
          <Field id="deliveryFeeRs" label={t("admin.orderForm.fee")} error={errors.deliveryFeeRs}>
            <input id="deliveryFeeRs" inputMode="numeric" value={String(value.deliveryFeeRs)} onChange={(e) => set({ deliveryFeeRs: Number(e.target.value.replace(/\D/g, "")) || 0 })} className={inputClass} {...invalidProps("deliveryFeeRs", errors.deliveryFeeRs)} />
          </Field>
        </>
      )}
    </FormSection>
  );
}

/** Name, phone, optional email and the customer's note (S-122 AC1; manual orders FR-055). */
export function ContactFields({ value, errors, onChange }: { value: FormContact; errors: Errors; onChange: (next: FormContact) => void }) {
  const { t } = useI18n();
  const field = (key: keyof FormContact, type = "text", autoComplete = "off") => {
    const id = `contact.${key}`;
    const error = errors[id];
    const control =
      key === "note" ? (
        <textarea id={id} rows={3} value={value.note} onChange={(e) => onChange({ ...value, note: e.target.value })} className={inputClass} {...invalidProps(id, error)} />
      ) : (
        <input id={id} type={type} autoComplete={autoComplete} value={value[key]} onChange={(e) => onChange({ ...value, [key]: e.target.value })} className={inputClass} {...invalidProps(id, error)} />
      );
    return (
      <Field id={id} label={t(`admin.orderForm.${key}`)} error={error}>
        {control}
      </Field>
    );
  };
  return (
    <FormSection id="contact-heading" title={t("admin.orderForm.contactTitle")}>
      {field("name")}
      {field("phone", "tel")}
      {field("email", "email")}
      {field("note")}
    </FormSection>
  );
}

/** The live total and, on an edit, "Set total by hand" (S-122 AC3, AC11): the switch says its state. */
export function TotalPanel(props: { itemsTotalRs: number; deliveryFeeRs: number; calculatedRs: number; fulfilment: "delivery" | "pickup"; override: number | null | undefined; error?: string; onOverride?: (value: number | null) => void }) {
  const { t } = useI18n();
  const { override, onOverride } = props;
  const on = override !== null && override !== undefined;
  const row = "flex flex-wrap justify-between gap-x-4";
  return (
    <FormSection id="total-heading" title={t("admin.orderForm.totalTitle")}>
      <div className="mt-3 grid gap-2 rounded-lg bg-muted p-4" aria-live="polite">
        <p className={row}>
          <span>{t("admin.orderForm.itemsLine")}</span>
          <span className="tabular-nums">{formatRupees(props.itemsTotalRs)}</span>
        </p>
        {props.fulfilment === "delivery" ? (
          <p className={row}>
            <span>{t("admin.orderForm.feeLine")}</span>
            <span className="tabular-nums">{formatRupees(props.deliveryFeeRs)}</span>
          </p>
        ) : (
          <p>{t("admin.orderForm.pickupFree")}</p>
        )}
        <p className={`${row} border-t border-input pt-2 text-lg font-semibold`}>
          <span>{t("admin.orderForm.total")}</span>
          <span className="tabular-nums" data-testid="form-total">
            {formatRupees(on ? override : props.calculatedRs)}
          </span>
        </p>
      </div>
      {onOverride && (
        <>
          {/* The native switch covers the whole row (44 px target); the track is decorative. */}
          <label className="relative mt-4 flex min-h-12 cursor-pointer items-center gap-3 rounded-md border-2 border-input bg-card px-3 font-semibold has-checked:border-primary">
            <input type="checkbox" role="switch" checked={on} onChange={(e) => onOverride(e.target.checked ? props.calculatedRs : null)} className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-md" />
            <span aria-hidden="true" className="relative h-6 w-10 shrink-0 rounded-full border-2 border-input bg-muted after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-foreground peer-checked:border-primary peer-checked:bg-primary peer-checked:after:left-[1.1rem] peer-checked:after:bg-primary-foreground" />
            <span>
              {t("admin.orderForm.byHand")} <span className="font-normal">({on ? t("admin.orderForm.byHandOn") : t("admin.orderForm.byHandOff")})</span>
            </span>
          </label>
          {on && (
            <Field id="overrideTotalRs" label={t("admin.orderForm.byHandAmount")} error={props.error}>
              <p id="overrideTotalRs-hint" className="text-sm">
                {t("admin.orderForm.byHandHint", { amount: formatRupees(props.calculatedRs) })}
              </p>
              <input id="overrideTotalRs" inputMode="numeric" value={String(override)} onChange={(e) => onOverride(Number(e.target.value.replace(/\D/g, "")) || 0)} className={inputClass} {...invalidProps("overrideTotalRs", props.error)} />
            </Field>
          )}
        </>
      )}
    </FormSection>
  );
}
