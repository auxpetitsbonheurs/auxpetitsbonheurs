// Delivery or pickup time windows (S-056 AC1, AC5, AC10): label in English and French, start
// and end as "HH:mm". Existing rows keep their id (orders snapshot windows, so a renamed or
// removed one changes nothing on them); added rows get a new short id. One to six per list.
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { WINDOWS_MAX, WINDOWS_MIN, WINDOW_LABEL_MAX, type WindowList, type WindowValue, newWindowId } from "~/domain/availability";
import { useI18n } from "~/i18n/react";

type Errors = Record<string, string | undefined>;

const inputClass = "mt-1 block min-h-12 w-full min-w-0 rounded-md border-2 border-input bg-card px-3 py-2 text-base text-foreground aria-invalid:border-destructive";

interface Row extends WindowValue {
  key: string;
}

function Field({ id, name, label, prefix, value, error, hintId, maxLength, inputMode, className }: { className?: string; id: string; name: string; label: string; prefix: string; value: string; error?: string; hintId?: string; maxLength: number; inputMode?: "numeric" }) {
  return (
    <div className={`min-w-0 ${className ?? ""}`}>
      <label htmlFor={id} className="block font-semibold">
        <span className="sr-only">{prefix} </span>
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="text"
        inputMode={inputMode}
        autoComplete="off"
        maxLength={maxLength}
        defaultValue={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined}
        className={inputClass}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1 font-semibold text-destructive wrap-anywhere">
          {error}
        </p>
      )}
    </div>
  );
}

export function WindowsEditor({ list, initial, errors, onChange }: { list: WindowList; initial: WindowValue[]; errors: Errors; onChange: () => void }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<Row[]>(() => initial.map((w) => ({ ...w, key: w.id })));
  const [message, setMessage] = useState("");
  const base = list === "deliveryWindows" ? "delivery" : "pickup";
  const title = t(`admin.availability.${base}Title`);
  const add = () => {
    const taken = new Set(rows.map((r) => r.id));
    let id = newWindowId();
    while (taken.has(id)) id = newWindowId();
    setRows((current) => [...current, { id, key: id, start: "", end: "", label: { en: "" } }]);
    setMessage(t("admin.availability.windowAdded", { window: t(`admin.availability.windowName.${list}`, { n: rows.length + 1 }) }));
    onChange();
    // Focus the new row's first field once it exists.
    requestAnimationFrame(() => document.getElementById(`${base}-${rows.length}-label-en`)?.focus());
  };
  const remove = (key: string, n: number) => {
    setRows((current) => current.filter((r) => r.key !== key));
    setMessage(t("admin.availability.windowRemoved", { window: t(`admin.availability.windowName.${list}`, { n }) }));
    onChange();
    requestAnimationFrame(() => document.getElementById(`${base}-add`)?.focus());
  };
  return (
    <fieldset id={base} tabIndex={-1} className="min-w-0 outline-offset-2" aria-describedby={errors[list] ? `${base}-list-error` : undefined}>
      <legend className="text-lg font-semibold">{title}</legend>
      <p id={`${base}-time-hint`} className="text-sm text-muted-foreground">
        {t("admin.availability.timeHint")}
      </p>
      {errors[list] && (
        <p id={`${base}-list-error`} className="mt-1 font-semibold text-destructive">
          {errors[list]}
        </p>
      )}
      <ol className="mt-3 grid gap-3">
        {rows.map((row, index) => {
          const n = index + 1;
          const name = `${list}.${index}`;
          const prefix = t(`admin.availability.windowName.${list}`, { n });
          const id = (part: string) => `${base}-${index}-${part}`;
          return (
            <li key={row.key} className="min-w-0 rounded-md border-2 border-input p-2 min-[20rem]:p-3">
              <p className="font-semibold">{prefix}</p>
              <input type="hidden" name={`${name}.id`} value={row.id} />
              {/* Names stack on phones; the two short times sit side by side from 20rem (one less screen per window). */}
              <div className="mt-2 grid gap-3 min-[20rem]:grid-cols-2">
                <Field className="min-[20rem]:col-span-2 sm:col-span-1" id={id("label-en")} name={`${name}.label.en`} prefix={prefix} label={t("admin.availability.labelEn")} value={row.label.en} error={errors[`${name}.label.en`]} maxLength={WINDOW_LABEL_MAX} />
                <Field className="min-[20rem]:col-span-2 sm:col-span-1" id={id("label-fr")} name={`${name}.label.fr`} prefix={prefix} label={t("admin.availability.labelFr")} value={row.label.fr ?? ""} error={errors[`${name}.label.fr`]} maxLength={WINDOW_LABEL_MAX} />
                <Field id={id("start")} name={`${name}.start`} prefix={prefix} label={t("admin.availability.start")} value={row.start} error={errors[`${name}.start`]} hintId={`${base}-time-hint`} maxLength={5} inputMode="numeric" />
                <Field id={id("end")} name={`${name}.end`} prefix={prefix} label={t("admin.availability.end")} value={row.end} error={errors[`${name}.end`]} hintId={`${base}-time-hint`} maxLength={5} inputMode="numeric" />
              </div>
              {rows.length > WINDOWS_MIN && (
                <Button type="button" variant="outline" className="mt-3 h-auto min-h-11 max-w-full whitespace-normal max-[20rem]:px-2" onClick={() => remove(row.key, n)}>
                  <Trash2 aria-hidden="true" className="max-[20rem]:hidden" />
                  {t("admin.availability.removeWindow", { window: prefix })}
                </Button>
              )}
            </li>
          );
        })}
      </ol>
      {rows.length < WINDOWS_MAX ? (
        <Button id={`${base}-add`} type="button" variant="outline" className="mt-3 h-auto min-h-11 max-w-full whitespace-normal max-[20rem]:px-2" onClick={add}>
          <Plus aria-hidden="true" className="max-[20rem]:hidden" />
          {t(`admin.availability.add.${list}`)}
        </Button>
      ) : (
        <p id={`${base}-add`} tabIndex={-1} className="mt-3 text-sm font-semibold">
          {t("admin.availability.windowsFull", { max: WINDOWS_MAX })}
        </p>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {message}
      </p>
    </fieldset>
  );
}
