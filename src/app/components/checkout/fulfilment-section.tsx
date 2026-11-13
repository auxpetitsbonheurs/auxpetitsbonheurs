import { Bike, Store } from "lucide-react";
import { useState } from "react";
import { RadioCard } from "~/components/ui/radio-card";
import { TextField } from "~/components/ui/text-field";
import { useI18n } from "~/i18n/react";
import { useHydrated } from "~/lib/use-hydrated";

export type FulfilmentChoice = "delivery" | "pickup";
export type FieldErrors = Record<string, string | undefined>;

export interface FulfilmentSectionProps {
  /** Omitted for a custom request (E-08): its quote includes delivery, so no fee line. */
  deliveryFee?: string;
  pickupAddress: string | null;
  pickupMapUrl: string | null;
  /** Re-selected after a refused submit (no JavaScript); never a default choice. */
  initial: { fulfilment?: string; address?: string; landmark?: string; savedAddressId?: string; saveAddress?: string };
  errors: FieldErrors;
  onChoose?: (value: FulfilmentChoice) => void;
  /** Section title; defaults to the checkout's numbered step (a custom request has its own, E-08). */
  title?: string;
  /** A signed-in customer's saved addresses (E-11 S-212); null for a guest (no choice, no Save box). */
  savedAddresses?: CheckoutAddress[] | null;
}

/** A signed-in customer's saved address offered at checkout (E-11 S-212). */
export interface CheckoutAddress {
  id: string;
  label: string;
  address: string;
  landmark: string | null;
  isDefault: boolean;
}

/**
 * Saved addresses (S-212 AC2, AC8): a labelled radio group (arrow keys move), the default chosen
 * first, and "A new address" that shows the fields. Without JavaScript the fields stay visible and
 * the server uses the chosen saved address.
 */
function SavedAddresses({ addresses, initial, onPick }: { addresses: CheckoutAddress[]; initial: string; onPick: (id: string) => void }) {
  const { t } = useI18n();
  return (
    <fieldset id="savedAddressId" className="mb-6 min-w-0">
      <legend className="font-semibold">{t("checkout.savedAddresses")}</legend>
      <div className="mt-3 grid gap-3">
        {addresses.map((a) => (
          <RadioCard key={a.id} id={`saved-${a.id}`} name="savedAddressId" value={a.id} title={a.label} hint={a.landmark ? `${a.address}, ${a.landmark}` : a.address} defaultChecked={initial === a.id} onChoose={onPick} />
        ))}
        <RadioCard id="saved-new" name="savedAddressId" value="new" title={t("checkout.newAddress")} defaultChecked={initial === "new"} onChoose={onPick} />
      </div>
    </fieldset>
  );
}

/**
 * Step 2 (FR-019): two required radio cards with no default. Delivery shows the
 * address, landmark and fee; pickup shows the address from Settings and "free".
 * Which details show is pure CSS (`data-when`, app.css), so it works without JS.
 */
export function FulfilmentSection({ deliveryFee, pickupAddress, pickupMapUrl, initial, errors, onChoose, title, savedAddresses = null }: FulfilmentSectionProps) {
  const { t } = useI18n();
  const choose = (value: string) => onChoose?.(value as FulfilmentChoice);
  const saved = savedAddresses && savedAddresses.length > 0 ? savedAddresses : null;
  const firstPick = initial.savedAddressId ?? (saved?.find((a) => a.isDefault)?.id ?? (saved ? saved[0]!.id : "new"));
  const [picked, setPicked] = useState(firstPick);
  const hydrated = useHydrated();
  // Hidden only once JavaScript runs: without it the fields stay and the server uses the saved choice.
  const typing = !saved || picked === "new" || !hydrated;
  return (
    <section aria-labelledby="fulfilment-heading" className="mt-10">
      <h2 id="fulfilment-heading" className="section-title-start text-h2">
        {title ?? t("checkout.sections.fulfilment")}
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
        {saved && <SavedAddresses addresses={saved} initial={firstPick} onPick={setPicked} />}
        <div hidden={!typing}>
          <TextField id="address" name="address" multiline autoComplete="street-address" label={t("checkout.address")} hint={t("checkout.addressHint")} error={errors.address} defaultValue={initial.address} />
          <TextField id="landmark" name="landmark" type="text" autoComplete="off" className="mt-4" label={t("checkout.landmark")} optionalLabel={t("checkout.optional")} hint={t("checkout.landmarkHint")} error={errors.landmark} defaultValue={initial.landmark} />
          {savedAddresses && (
            // S-212 AC3, AC7: keep a typed address on the account after the order is placed.
            <label className="mt-4 inline-flex min-h-11 cursor-pointer items-center gap-3">
              <input type="checkbox" name="saveAddress" defaultChecked={initial.saveAddress === "on"} className="size-6 accent-primary" />
              <span>{t("checkout.saveAddress")}</span>
            </label>
          )}
        </div>
        {deliveryFee && <p className="mt-4 font-semibold">{t("checkout.deliveryFee", { fee: deliveryFee })}</p>}
      </div>
      <div data-when="pickup" className="mt-6">
        {pickupAddress && <p>{t("checkout.pickupAddress", { address: pickupAddress })}</p>}
        {pickupMapUrl && (
          <a href={pickupMapUrl} className="inline-flex min-h-11 items-center font-semibold link">
            {t("checkout.mapLink")}
          </a>
        )}
        <p className="mt-2 font-semibold">{t("checkout.pickupFree")}</p>
      </div>
    </section>
  );
}
