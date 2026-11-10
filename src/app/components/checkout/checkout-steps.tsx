import { RadioCard } from "~/components/ui/radio-card";
import { TextField } from "~/components/ui/text-field";
import { localized } from "~/i18n/localized";
import { useI18n } from "~/i18n/react";
import type { FieldErrors } from "./fulfilment-section";

export interface WindowOption {
  id: string;
  start: string;
  end: string;
  label: { en: string; fr?: string | null };
}

type Initial = Record<string, string | undefined>;

function Heading({ id, text }: { id: string; text: string }) {
  return (
    <h2 id={id} className="text-2xl">
      {text}
    </h2>
  );
}

/** Step 3: native date field, today (Mauritius) or later; full availability rules arrive in E-05. */
export function DateSection({ today, todayLabel, initial, error }: { today: string; todayLabel: string; initial?: string; error?: string }) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="date-heading" className="mt-10">
      <Heading id="date-heading" text={t("checkout.sections.date")} />
      <TextField id="date" name="date" type="date" min={today} autoComplete="off" className="mt-4 max-w-xs" label={t("checkout.date")} hint={t("checkout.dateHint", { date: todayLabel })} error={error} defaultValue={initial} />
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
          <RadioCard key={w.id} id={`window-${kind}-${w.id}`} name={`windowId.${kind}`} value={w.id} defaultChecked={initial === w.id} title={t("checkout.windowLabel", { label: localized(w.label, locale), start: w.start, end: w.end })} />
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
