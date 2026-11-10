import { Check, LoaderCircle } from "lucide-react";
import { Button } from "~/components/ui/button";
import { useI18n } from "~/i18n/react";
import { formatRupees } from "~/lib/locale";
import type { FieldErrors } from "./fulfilment-section";

export interface SummaryItem {
  lineId: string;
  name: string;
  quantity: number;
  lineTotalRs: number;
}

const row = "flex flex-wrap justify-between gap-x-4";
const amount = (rs: number) => <span className="whitespace-nowrap">{formatRupees(rs)}</span>;

/** Total for each choice; CSS shows the one matching the chosen fulfilment. */
export function TotalByChoice({ itemsTotalRs, deliveryFeeRs }: { itemsTotalRs: number; deliveryFeeRs: number }) {
  const { t } = useI18n();
  const strong = `${row} text-lg font-semibold`;
  return (
    <>
      <p data-when="none" className={strong}>
        <span>{t("checkout.totalItemsOnly")}</span>
        {amount(itemsTotalRs)}
      </p>
      <p data-when="delivery" className={strong}>
        <span>{t("checkout.total")}</span>
        {amount(itemsTotalRs + deliveryFeeRs)}
      </p>
      <p data-when="pickup" className={strong}>
        <span>{t("checkout.total")}</span>
        {amount(itemsTotalRs)}
      </p>
    </>
  );
}

function PolicyAcceptance({ policies, error, initial }: { policies: string; error?: string; initial?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="mt-6">
      {/* The native checkbox covers the row (44 px target, focus ring on the row); the box is decorative. */}
      <label htmlFor="acceptPolicies" className="relative flex min-h-11 cursor-pointer items-center gap-3 rounded-lg py-2 pe-2">
        <input
          type="checkbox"
          id="acceptPolicies"
          name="acceptPolicies"
          defaultChecked={initial}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "acceptPolicies-error" : undefined}
          className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-lg"
        />
        <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-xs border-2 border-input bg-card text-card peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground">
          <Check className="size-4" strokeWidth={3} />
        </span>
        <span className="font-semibold">{t("checkout.acceptPolicies")}</span>
      </label>
      {error && (
        <p id="acceptPolicies-error" className="mt-1 font-semibold text-destructive">
          {error}
        </p>
      )}
      <details className="mt-2">
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold link">
          {t("checkout.readPolicies")}
        </summary>
        <p className="mt-2 max-w-measure whitespace-pre-line">{policies}</p>
      </details>
    </div>
  );
}

export interface SummarySectionProps {
  items: SummaryItem[];
  itemsTotalRs: number;
  deliveryFeeRs: number;
  juiceNumber: string | null;
  policies: string;
  errors: FieldErrors;
  initialAccepted?: boolean;
}

/** Step 6 (FR-022): items, fee line or "Pickup: free", total, payment info, policies. */
export function SummarySection({ items, itemsTotalRs, deliveryFeeRs, juiceNumber, policies, errors, initialAccepted }: SummarySectionProps) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="summary-heading" className="mt-10">
      <h2 id="summary-heading" className="text-h2">
        {t("checkout.sections.summary")}
      </h2>
      <div className="mt-4 grid gap-2 rounded-lg bg-muted p-5">
        <ul className="grid gap-1">
          {items.map((item) => (
            <li key={item.lineId} className={row}>
              <span>{t("checkout.itemLine", { name: item.name, quantity: item.quantity })}</span>
              {amount(item.lineTotalRs)}
            </li>
          ))}
        </ul>
        <p data-when="delivery" className={row}>
          <span>{t("checkout.feeLine")}</span>
          {amount(deliveryFeeRs)}
        </p>
        <p data-when="pickup">{t("checkout.pickupFree")}</p>
        <TotalByChoice itemsTotalRs={itemsTotalRs} deliveryFeeRs={deliveryFeeRs} />
      </div>
      <p className="mt-4 max-w-measure">{juiceNumber ? t("checkout.paymentJuice", { number: juiceNumber }) : t("checkout.paymentCash")}</p>
      <PolicyAcceptance policies={policies} error={errors.acceptPolicies} initial={initialAccepted} />
    </section>
  );
}

/**
 * Sticky bar (design-system pattern): total + "Place order"; unsticks while typing (app.css).
 * While sending (S-014 AC7) the button is disabled and busy with a spinner but keeps its
 * accessible name; "Sending your order…" is announced in a status region instead.
 */
export function PlaceOrderBar({ itemsTotalRs, deliveryFeeRs, label, submitting }: { itemsTotalRs: number; deliveryFeeRs: number; label: string; submitting: boolean }) {
  const { t } = useI18n();
  return (
    <div data-sticky-bar className="sticky bottom-0 z-10 mt-8 border-t bg-card py-3 shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="min-w-0">
          <TotalByChoice itemsTotalRs={itemsTotalRs} deliveryFeeRs={deliveryFeeRs} />
        </div>
        <Button type="submit" name="intent" value="placeOrder" size="lg" disabled={submitting} aria-busy={submitting || undefined} className="min-w-1/2 grow">
          {submitting && <LoaderCircle aria-hidden="true" data-testid="sending-spinner" className="motion-safe:animate-spin" />}
          {label}
        </Button>
        <p role="status" className="sr-only">
          {submitting ? t("checkout.sending") : ""}
        </p>
      </div>
    </div>
  );
}
