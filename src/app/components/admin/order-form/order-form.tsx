import { useEffect, useRef } from "react";
import { Alert } from "~/components/ui/alert";
import { SubmitButton } from "~/components/ui/submit-button";
import type { TimeWindow } from "~/db/schema";
import type { Menu } from "~/domain/menu";
import { useI18n } from "~/i18n/react";
import { ContactFields, FulfilmentFields, TotalPanel } from "./detail-fields";
import { LinesEditor } from "./lines-editor";
import { type OrderFormState, lineTotals } from "./model";

export interface OrderFormProps {
  state: OrderFormState;
  onChange: (state: OrderFormState) => void;
  menu: Menu;
  windows: { delivery: TimeWindow[]; pickup: TimeWindow[] };
  /** Field → message, from the server or the form's own checks. */
  errors: Record<string, string>;
  /** A problem that belongs to no field (a product no longer on the menu). */
  formError?: string;
  /** Edit only: offers "Set total by hand". */
  allowOverride: boolean;
  submitLabel: string;
  pendingText: string;
  pending: boolean;
  onSubmit: () => void;
  /** The time the live prices are judged at (the menu's promotions). */
  nowMs: number;
}

/** Every problem in one summary with links to the fields; focused when it appears (S-122 AC11). */
function ErrorSummary({ errors, formError }: { errors: Record<string, string>; formError?: string }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const entries = Object.entries(errors);
  const key = `${formError ?? ""}|${entries.map(([k, v]) => `${k}:${v}`).join("|")}`;
  useEffect(() => {
    if (key !== "|") ref.current?.focus();
  }, [key]);
  if (entries.length === 0 && !formError) return null;
  return (
    <Alert ref={ref} tone="danger" role="alert" tabIndex={-1} title={t("admin.orderForm.errorsTitle")} className="mt-6 outline-offset-2">
      {formError && <p className="wrap-anywhere">{formError}</p>}
      <ul className="mt-1 grid gap-1">
        {entries.map(([field, message]) => (
          <li key={field}>
            <a href={`#${field === "lines" ? "lines" : field}`} className="inline-flex min-h-11 items-center link wrap-anywhere">
              {message}
            </a>
          </li>
        ))}
      </ul>
    </Alert>
  );
}

/**
 * The admin order form (S-122 edit; built to be shared with the manual order, E-07 FR-055): items,
 * delivery or pickup, customer, and the live total. The state lives in the page, so a refused save
 * (ORDER_CHANGED, a field problem) never loses what was typed (S-122 AC9).
 */
export function OrderForm(props: OrderFormProps) {
  const { state, onChange, menu, errors } = props;
  const totals = lineTotals(state.lines, menu, props.nowMs);
  const itemsTotalRs = totals.reduce((a, b) => a + b, 0);
  const fee = state.fulfilment.fulfilment === "pickup" ? 0 : state.fulfilment.deliveryFeeRs;
  return (
    // A container, not a form: the item sheets hold forms of their own, and forms cannot nest.
    <div>
      <ErrorSummary errors={errors} formError={props.formError} />
      <LinesEditor lines={state.lines} totals={totals} menu={menu} error={errors.lines} onChange={(lines) => onChange({ ...state, lines })} />
      <FulfilmentFields value={state.fulfilment} windows={props.windows} errors={errors} onChange={(fulfilment) => onChange({ ...state, fulfilment })} />
      <ContactFields value={state.contact} errors={errors} onChange={(contact) => onChange({ ...state, contact })} />
      <TotalPanel
        itemsTotalRs={itemsTotalRs}
        deliveryFeeRs={fee}
        calculatedRs={itemsTotalRs + fee}
        fulfilment={state.fulfilment.fulfilment}
        override={props.allowOverride ? state.overrideTotalRs : undefined}
        error={errors.overrideTotalRs}
        onOverride={props.allowOverride ? (overrideTotalRs) => onChange({ ...state, overrideTotalRs }) : undefined}
      />
      <form
        noValidate
        data-editor-bar=""
        className="sticky bottom-0 z-30 -mx-4 mt-8 border-t border-border bg-card px-4 py-3 shadow-md min-[20rem]:bottom-[calc(3.5rem+env(safe-area-inset-bottom))] md:-mx-6 md:px-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (!props.pending) props.onSubmit();
        }}
      >
        <SubmitButton pending={props.pending} pendingText={props.pendingText} size="lg" className="h-auto min-h-12 w-full whitespace-normal">
          {props.submitLabel}
        </SubmitButton>
      </form>
    </div>
  );
}
