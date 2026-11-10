import { Bike, Store } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "~/i18n/react";
import { cn } from "~/lib/utils";

export type FulfilmentChoice = "delivery" | "pickup";

const fieldClass =
  "mt-2 block w-full rounded-md border-2 border-input bg-background px-3 py-2 text-base text-foreground aria-invalid:border-destructive";

interface RadioCardProps {
  value: FulfilmentChoice;
  title: string;
  hint: string;
  icon: ReactNode;
  defaultChecked: boolean;
  onChoose?: (value: FulfilmentChoice) => void;
}

function RadioCard({ value, title, hint, icon, defaultChecked, onChoose }: RadioCardProps) {
  return (
    <label
      htmlFor={`fulfilment-${value}`}
      className="relative flex min-h-11 min-w-0 cursor-pointer items-start gap-2 rounded-lg border-2 border-input bg-background p-3 has-checked:border-primary has-checked:bg-accent sm:gap-3 sm:p-4"
    >
      {/* The native radio covers the whole card, so the tap target and focus ring are the card. */}
      <input
        type="radio"
        id={`fulfilment-${value}`}
        name="fulfilment"
        value={value}
        defaultChecked={defaultChecked}
        onChange={() => onChoose?.(value)}
        className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-lg"
      />
      <span
        aria-hidden="true"
        className="mt-0.5 size-5 shrink-0 rounded-full border-2 border-input bg-background peer-checked:border-[6px] peer-checked:border-primary"
      />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-x-2 font-semibold">
          {icon}
          {title}
        </span>
        <span className="block text-sm">{hint}</span>
      </span>
    </label>
  );
}

export interface FulfilmentSectionProps {
  deliveryFee: string;
  pickupAddress: string | null;
  pickupMapUrl: string | null;
  /** Re-selected after a refused submit (no JavaScript); never a default choice. */
  initial: { fulfilment?: FulfilmentChoice; address?: string; landmark?: string };
  errors: Record<string, string | undefined>;
  onChoose?: (value: FulfilmentChoice) => void;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 font-semibold text-destructive">
      {message}
    </p>
  );
}

/**
 * Step 2 (FR-019): two required radio cards with no default. Delivery shows the
 * address, landmark and fee; pickup shows the address from Settings and "free".
 * Which details show is pure CSS (`data-when`, app.css), so it works without JS.
 */
export function FulfilmentSection({ deliveryFee, pickupAddress, pickupMapUrl, initial, errors, onChoose }: FulfilmentSectionProps) {
  const { t } = useI18n();
  const iconClass = "size-5";
  return (
    <section aria-labelledby="fulfilment-heading" className="mt-10">
      <h2 id="fulfilment-heading" className="text-2xl">
        {t("checkout.sections.fulfilment")}
      </h2>
      <fieldset
        id="fulfilment"
        tabIndex={-1}
        aria-describedby={errors.fulfilment ? "fulfilment-error" : undefined}
        className="mt-4 min-w-0"
      >
        <legend className="font-semibold">{t("checkout.fulfilmentLegend")}</legend>
        <FieldError id="fulfilment-error" message={errors.fulfilment} />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <RadioCard value="delivery" title={t("checkout.delivery")} hint={t("checkout.deliveryHint")} icon={<Bike aria-hidden="true" className={iconClass} />} defaultChecked={initial.fulfilment === "delivery"} onChoose={onChoose} />
          <RadioCard value="pickup" title={t("checkout.pickup")} hint={t("checkout.pickupHint")} icon={<Store aria-hidden="true" className={iconClass} />} defaultChecked={initial.fulfilment === "pickup"} onChoose={onChoose} />
        </div>
      </fieldset>
      <div data-when="delivery" className="mt-6">
        <label htmlFor="address" className="block font-semibold">
          {t("checkout.address")}
        </label>
        <p id="address-hint" className="text-sm text-muted-foreground">
          {t("checkout.addressHint")}
        </p>
        <textarea
          id="address"
          name="address"
          rows={3}
          autoComplete="street-address"
          defaultValue={initial.address}
          aria-invalid={errors.address ? true : undefined}
          aria-describedby={cn("address-hint", errors.address && "address-error")}
          className={fieldClass}
        />
        <FieldError id="address-error" message={errors.address} />
        <label htmlFor="landmark" className="mt-4 block font-semibold">
          {t("checkout.landmark")} <span className="font-normal">{t("checkout.optional")}</span>
        </label>
        <p id="landmark-hint" className="text-sm text-muted-foreground">
          {t("checkout.landmarkHint")}
        </p>
        <input id="landmark" name="landmark" type="text" autoComplete="off" defaultValue={initial.landmark} aria-describedby="landmark-hint" className={fieldClass} />
        <p className="mt-4 font-semibold">{t("checkout.deliveryFee", { fee: deliveryFee })}</p>
      </div>
      <div data-when="pickup" className="mt-6">
        {pickupAddress && <p>{t("checkout.pickupAddress", { address: pickupAddress })}</p>}
        {pickupMapUrl && (
          <a href={pickupMapUrl} className="inline-flex min-h-11 items-center font-semibold text-primary-strong underline underline-offset-4">
            {t("checkout.mapLink")}
          </a>
        )}
        <p className="mt-2 font-semibold">{t("checkout.pickupFree")}</p>
      </div>
    </section>
  );
}
