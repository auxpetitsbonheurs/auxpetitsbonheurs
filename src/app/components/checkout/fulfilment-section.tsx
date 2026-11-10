import { Bike, Store } from "lucide-react";
import { RadioCard } from "~/components/ui/radio-card";
import { TextField } from "~/components/ui/text-field";
import { useI18n } from "~/i18n/react";

export type FulfilmentChoice = "delivery" | "pickup";
export type FieldErrors = Record<string, string | undefined>;

export interface FulfilmentSectionProps {
  deliveryFee: string;
  pickupAddress: string | null;
  pickupMapUrl: string | null;
  /** Re-selected after a refused submit (no JavaScript); never a default choice. */
  initial: { fulfilment?: string; address?: string; landmark?: string };
  errors: FieldErrors;
  onChoose?: (value: FulfilmentChoice) => void;
}

/**
 * Step 2 (FR-019): two required radio cards with no default. Delivery shows the
 * address, landmark and fee; pickup shows the address from Settings and "free".
 * Which details show is pure CSS (`data-when`, app.css), so it works without JS.
 */
export function FulfilmentSection({ deliveryFee, pickupAddress, pickupMapUrl, initial, errors, onChoose }: FulfilmentSectionProps) {
  const { t } = useI18n();
  const choose = (value: string) => onChoose?.(value as FulfilmentChoice);
  return (
    <section aria-labelledby="fulfilment-heading" className="mt-10">
      <h2 id="fulfilment-heading" className="text-2xl">
        {t("checkout.sections.fulfilment")}
      </h2>
      <fieldset id="fulfilment" tabIndex={-1} aria-describedby={errors.fulfilment ? "fulfilment-error" : undefined} className="mt-4 min-w-0">
        <legend className="font-semibold">{t("checkout.fulfilmentLegend")}</legend>
        {errors.fulfilment && (
          <p id="fulfilment-error" className="mt-1 font-semibold text-destructive">
            {errors.fulfilment}
          </p>
        )}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <RadioCard id="fulfilment-delivery" name="fulfilment" value="delivery" title={t("checkout.delivery")} hint={t("checkout.deliveryHint")} icon={<Bike aria-hidden="true" className="size-5" />} defaultChecked={initial.fulfilment === "delivery"} onChoose={choose} />
          <RadioCard id="fulfilment-pickup" name="fulfilment" value="pickup" title={t("checkout.pickup")} hint={t("checkout.pickupHint")} icon={<Store aria-hidden="true" className="size-5" />} defaultChecked={initial.fulfilment === "pickup"} onChoose={choose} />
        </div>
      </fieldset>
      <div data-when="delivery" className="mt-6">
        <TextField id="address" name="address" multiline autoComplete="street-address" label={t("checkout.address")} hint={t("checkout.addressHint")} error={errors.address} defaultValue={initial.address} />
        <TextField id="landmark" name="landmark" type="text" autoComplete="off" className="mt-4" label={t("checkout.landmark")} optionalLabel={t("checkout.optional")} hint={t("checkout.landmarkHint")} error={errors.landmark} defaultValue={initial.landmark} />
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
