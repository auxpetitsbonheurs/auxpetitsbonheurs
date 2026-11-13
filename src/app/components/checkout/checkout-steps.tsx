import { Suspense, lazy } from "react";
import { RadioCard } from "~/components/ui/radio-card";
import { TextField } from "~/components/ui/text-field";
import type { BasketDates } from "~/domain/availability";
import { addDays, formatDayLabel, formatWindowTime } from "~/domain/time";
import { localized } from "~/i18n/localized";
import { useI18n } from "~/i18n/react";
import { useHydrated } from "~/lib/use-hydrated";
import type { FieldErrors } from "./fulfilment-section";

// The calendar is its own chunk, fetched once the page is interactive (S-087 AC9).
const DatePicker = lazy(() => import("./date-picker"));

export interface WindowOption {
  id: string;
  start: string;
  end: string;
  label: { en: string; fr?: string | null };
}

type Initial = Record<string, string | undefined>;

function Heading({ id, text }: { id: string; text: string }) {
  return (
    <h2 id={id} className="section-title-start text-h2">
      {text}
    </h2>
  );
}

export interface DateSectionProps {
  /** The basket's 90 days (domain/availability `basketDates`), item names in the page language. */
  dates: BasketDates<string>;
  today: string;
  initial?: string;
  error?: string;
  whatsapp: string | null;
}

/**
 * Without JavaScript (and until the calendar chunk arrives): a native date field limited to
 * the earliest date and the 90-day horizon; the server judges the rest (S-087 AC9).
 */
function NativeDate({ dates, today, initial, error }: Omit<DateSectionProps, "whatsapp">) {
  const { t, locale } = useI18n();
  const hint = dates.earliest ? t("checkout.dateHint", { date: formatDayLabel(dates.earliest, locale) }) : t("checkout.dates.noDates");
  return (
    <TextField id="date" name="date" type="date" min={dates.earliest ?? today} max={addDays(today, dates.days.length - 1)} autoComplete="off" className="mt-4 max-w-xs" label={t("checkout.date")} hint={hint} error={error} defaultValue={initial} />
  );
}

/** Step 3 (FR-013, FR-014): the calendar that says why a day cannot be chosen. */
export function DateSection(props: DateSectionProps) {
  const { t } = useI18n();
  const hydrated = useHydrated();
  const native = <NativeDate dates={props.dates} today={props.today} initial={props.initial} error={props.error} />;
  return (
    <section aria-labelledby="date-heading" className="mt-10">
      <Heading id="date-heading" text={t("checkout.sections.date")} />
      {hydrated ? <Suspense fallback={native}><DatePicker {...props} /></Suspense> : native}
    </section>
  );
}

function WindowList({ kind, windows, initial }: { kind: "delivery" | "pickup"; windows: WindowOption[]; initial?: string }) {
  const { t, locale } = useI18n();
  const legend = t(kind === "delivery" ? "checkout.timeLegendDelivery" : "checkout.timeLegendPickup");
  return (
    <fieldset data-when={kind} className="min-w-0">
      <legend className="font-semibold">{legend}</legend>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {windows.map((w) => (
          <RadioCard key={w.id} id={`window-${kind}-${w.id}`} name={`windowId.${kind}`} value={w.id} defaultChecked={initial === w.id} title={t("checkout.windowLabel", { label: localized(w.label, locale), start: formatWindowTime(w.start, locale), end: formatWindowTime(w.end, locale) })} />
        ))}
      </div>
    </fieldset>
  );
}

/** Step 4 (FR-020): the Settings windows for the chosen fulfilment; one list per fulfilment. */
export function TimeSection({ windows, initial, error }: { windows: { delivery: WindowOption[]; pickup: WindowOption[] }; initial: Initial; error?: string }) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="time-heading" className="mt-10">
      <Heading id="time-heading" text={t("checkout.sections.time")} />
      <div id="windows" tabIndex={-1} aria-describedby={error ? "windows-error" : undefined} className="mt-4 outline-none">
        {error && (
          <p id="windows-error" className="mb-2 font-semibold text-destructive">
            {error}
          </p>
        )}
        <p data-when="none">{t("checkout.chooseFulfilmentForTimes")}</p>
        <WindowList kind="delivery" windows={windows.delivery} initial={initial["windowId.delivery"]} />
        <WindowList kind="pickup" windows={windows.pickup} initial={initial["windowId.pickup"]} />
      </div>
    </section>
  );
}

/** Step 5 (FR-021): name, phone, email, optional note; visible labels and autocomplete. */
export function DetailsSection({ initial, errors }: { initial: Initial; errors: FieldErrors }) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="details-heading" className="mt-10">
      <Heading id="details-heading" text={t("checkout.sections.details")} />
      <div className="mt-4 grid max-w-xl gap-4">
        <TextField id="contact-name" name="contact.name" type="text" autoComplete="name" label={t("checkout.name")} error={errors["contact.name"]} defaultValue={initial["contact.name"]} />
        <TextField id="contact-phone" name="contact.phone" type="tel" inputMode="tel" autoComplete="tel" label={t("checkout.phone")} hint={t("checkout.phoneHint")} error={errors["contact.phone"]} defaultValue={initial["contact.phone"]} />
        <TextField id="contact-email" name="contact.email" type="email" inputMode="email" autoComplete="email" label={t("checkout.email")} hint={t("checkout.emailHint")} error={errors["contact.email"]} defaultValue={initial["contact.email"]} />
        <TextField id="contact-note" name="contact.note" multiline autoComplete="off" maxLength={1000} label={t("checkout.note")} optionalLabel={t("checkout.optional")} error={errors["contact.note"]} defaultValue={initial["contact.note"]} />
      </div>
    </section>
  );
}
