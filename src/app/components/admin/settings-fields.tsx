// Building blocks of the Owner's Settings and Availability forms (S-056..S-059): a section
// card and an English/French pair of fields with a remaining-characters hint (S-059 AC9,
// AC10: side by side from `md`, stacked on phones, every label names its language).
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useI18n } from "~/i18n/react";
import { cn } from "~/lib/utils";

export function SettingsSection({ id, title, intro, children }: { id: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className="min-w-0 rounded-card border border-border bg-card p-2 min-[20rem]:p-4 sm:p-6">
      <h2 id={`${id}-title`}>{title}</h2>
      {intro && <p className="mt-1 max-w-measure">{intro}</p>}
      <div className="mt-4 grid gap-5">{children}</div>
    </section>
  );
}

const controlClass =
  "mt-2 block min-h-12 w-full min-w-0 rounded-md border-2 border-input bg-card px-3 py-2 text-base text-foreground aria-invalid:border-destructive";

/** Announces the count after typing pauses (a polite region updated on every key is noise). */
function useQuietAnnouncement(text: string, delayMs = 1200) {
  const [spoken, setSpoken] = useState("");
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = setTimeout(() => setSpoken(text), delayMs);
    return () => clearTimeout(timer);
  }, [text, delayMs]);
  return spoken;
}

interface OneLanguageProps {
  id: string;
  name: string;
  label: string;
  max: number;
  value: string;
  multiline: boolean;
  error?: string;
  hintId?: string;
  /** Shown while the field is empty (Pages: "English will show in French", S-246 AC7). */
  emptyHint?: string;
  rows?: number;
}

function OneLanguage({ id, name, label, max, value, multiline, error, hintId, emptyHint, rows = 6 }: OneLanguageProps) {
  const { t } = useI18n();
  const [length, setLength] = useState(value.length);
  const left = max - length;
  const countText = t("admin.settings.charsLeft", { count: left });
  const spoken = useQuietAnnouncement(countText);
  const describedBy = cn(hintId, `${id}-count`, emptyHint && length === 0 && `${id}-empty`, error && `${id}-error`);
  const shared = {
    id,
    name,
    defaultValue: value,
    maxLength: max,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
    className: controlClass,
    onInput: (event: { currentTarget: { value: string } }) => setLength(event.currentTarget.value.length),
  } as const;
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block font-semibold">
        {label}
      </label>
      {multiline ? <textarea rows={rows} {...shared} /> : <input type="text" autoComplete="off" {...shared} />}
      <p id={`${id}-count`} className={cn("mt-1 text-sm", left < max / 10 ? "font-semibold" : "text-muted-foreground")}>
        {countText}
      </p>
      {emptyHint && length === 0 && (
        <p id={`${id}-empty`} className="mt-1 text-sm">
          {emptyHint}
        </p>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {spoken}
      </p>
      {error && (
        <p id={`${id}-error`} className="mt-1 font-semibold text-destructive wrap-anywhere">
          {error}
        </p>
      )}
    </div>
  );
}

export interface BilingualFieldProps {
  /** Form name prefix: posts `<name>.en` and `<name>.fr`. */
  name: string;
  /** Element id prefix: `<id>-en`, `<id>-fr`. */
  id: string;
  label: string;
  hint?: string;
  max: number;
  value: { en: string; fr?: string } | null;
  multiline?: boolean;
  errors: Record<string, string | undefined>;
  children?: ReactNode;
  /** Shown under the French field while it is empty. */
  frEmptyHint?: string;
  rows?: number;
}

/** English and French versions of one text; French left blank shows the English on French pages. */
export function BilingualField({ name, id, label, hint, max, value, multiline = false, errors, children, frEmptyHint, rows }: BilingualFieldProps) {
  const { t } = useI18n();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <fieldset className="min-w-0">
      <legend className="text-lg font-semibold">{label}</legend>
      {hint && (
        <p id={hintId} className="max-w-measure text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {children}
      <div className="mt-1 grid gap-4 md:grid-cols-2">
        <OneLanguage id={`${id}-en`} name={`${name}.en`} label={t("admin.settings.inEnglish", { label })} max={max} value={value?.en ?? ""} multiline={multiline} error={errors[`${name}.en`]} hintId={hintId} rows={rows} />
        <OneLanguage id={`${id}-fr`} name={`${name}.fr`} label={t("admin.settings.inFrench", { label })} max={max} value={value?.fr ?? ""} multiline={multiline} error={errors[`${name}.fr`]} hintId={hintId} rows={rows} emptyHint={frEmptyHint} />
      </div>
    </fieldset>
  );
}
