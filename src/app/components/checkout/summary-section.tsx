import type { ReactNode } from "react";
import { Check, CircleSlash } from "lucide-react";
import { SubmitButton } from "~/components/ui/submit-button";
import { useI18n } from "~/i18n/react";
import { PlainText } from "~/components/site/plain-text";
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
        <PlainText text={policies} className="mt-2" />
        <p className="mt-2 max-w-measure text-sm">{t("checkout.privacyNote")}</p>
      </details>
    </div>
  );
}

export interface SummarySectionProps {
  items: SummaryItem[];
  /** Lines that will not be ordered (sold out, hidden, deleted): one "not included" row each (UX audit H1). */
  leftOut?: { lineId: string; name: string }[];
  itemsTotalRs: number;
  deliveryFeeRs: number;
  policies: string;
  errors: FieldErrors;
  initialAccepted?: boolean;
}

/** Step 6 (FR-022): items, fee line or "Pickup: free", total, payment info, policies. */
export function SummarySection({ items, leftOut = [], itemsTotalRs, deliveryFeeRs, policies, errors, initialAccepted }: SummarySectionProps) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="summary-heading" className="mt-10">
      <h2 id="summary-heading" className="section-title-start text-h2">
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
          {leftOut.map((line) => (
            <li key={line.lineId} data-left-out className="flex items-start gap-1.5 text-muted-foreground">
              <CircleSlash aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              <span>{t("checkout.leftOutLine", { name: line.name })}</span>
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
      {/* Full payment by Juice; the account is shown only once the order is placed (S-278 AC6, S-277 AC4). */}
      <p className="mt-4 max-w-measure">{t("checkout.paymentInfo")}</p>
      <PolicyAcceptance policies={policies} error={errors.acceptPolicies} initial={initialAccepted} />
    </section>
  );
}

/**
 * "Place order at Rs {total}" (S-090 AC6) for the chosen fulfilment, by the same CSS switch as
 * the totals, so it is right without JavaScript; "Place order" until a choice is made.
 */
export function PlaceOrderLabel({ itemsTotalRs, deliveryFeeRs }: { itemsTotalRs: number; deliveryFeeRs: number }) {
  const { t } = useI18n();
  const at = (rs: number) => t("checkout.placeOrderAt", { total: formatRupees(rs) });
  return (
    <>
      <span data-when="none">{t("checkout.placeOrder")}</span>
      <span data-when="delivery">{at(itemsTotalRs + deliveryFeeRs)}</span>
      <span data-when="pickup">{at(itemsTotalRs)}</span>
    </>
  );
}

/**
 * Sticky bar (design-system pattern): total + "Place order"; unsticks while typing (app.css).
 * While sending (S-014 AC7) the button is disabled and busy with a spinner but keeps its
 * accessible name; "Sending your order…" is announced in a status region instead.
 */
export function PlaceOrderBar({ itemsTotalRs, deliveryFeeRs, label, submitting }: { itemsTotalRs: number; deliveryFeeRs: number; label: ReactNode; submitting: boolean }) {
  const { t } = useI18n();
  return (
    <div data-sticky-bar className="sticky bottom-0 z-10 mt-8 border-t bg-card py-3 shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="min-w-0">
          <TotalByChoice itemsTotalRs={itemsTotalRs} deliveryFeeRs={deliveryFeeRs} />
        </div>
        {/* Focusable while busy (aria-disabled, not disabled); repeat taps are ignored and the idempotency key covers the rest. */}
        <SubmitButton name="intent" value="placeOrder" size="lg" pending={submitting} pendingText={t("checkout.sending")} pendingLabel={t("checkout.sending")} className="h-auto min-h-12 min-w-1/2 max-w-full shrink grow whitespace-normal py-2">
          {label}
        </SubmitButton>
      </div>
    </div>
  );
}
