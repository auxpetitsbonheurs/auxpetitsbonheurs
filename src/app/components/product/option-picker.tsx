import { Minus, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "~/components/ui/button";
import { CheckboxRow } from "~/components/ui/checkbox-row";
import { RadioCard } from "~/components/ui/radio-card";
import type { OptionPick } from "~/domain/basket";
import type { PricingGroup } from "~/domain/pricing";
import { localized } from "~/i18n/localized";
import { useI18n } from "~/i18n/react";
import { formatRupees } from "~/lib/locale";
import { cn } from "~/lib/utils";
import { MessageField } from "./message-field";

/** Focused controls keep clear of the sticky Add bar on phones (AC11). */
export const CLEAR_OF_BAR = "scroll-mb-36 md:scroll-mb-0";

/** "+Rs 150" / "−Rs 100"; nothing for a choice that does not change the price. */
export function useDelta() {
  const { t } = useI18n();
  return (deltaRs: number) => (deltaRs === 0 ? undefined : t(deltaRs > 0 ? "productOptions.priceUp" : "productOptions.priceDown", { price: formatRupees(Math.abs(deltaRs)) }));
}

export interface StepperProps {
  id: string;
  name: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  decreaseLabel: string;
  increaseLabel: string;
  hint?: string;
}

/**
 * Stepper (design-system "Stepper"): a number field between − and + buttons, each named for
 * what it changes ("Decrease quantity of Chocolate cake"). The field alone works before
 * hydration and without JavaScript.
 */
export function Stepper({ id, name, label, value, min, max, onChange, decreaseLabel, increaseLabel, hint }: StepperProps) {
  const set = (next: number) => onChange(Math.min(max, Math.max(min, next)));
  return (
    <div>
      <label htmlFor={id} className="block font-semibold">
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="icon" className={cn("size-11", CLEAR_OF_BAR)} aria-label={decreaseLabel} aria-controls={id} disabled={value <= min} onClick={() => set(value - 1)}>
          <Minus aria-hidden="true" />
        </Button>
        <input
          id={id}
          name={name}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isInteger(next)) set(next);
          }}
          className={cn("min-h-11 w-16 rounded-md border-2 border-input bg-card px-2 text-center text-lg font-semibold tabular-nums", CLEAR_OF_BAR)}
        />
        <Button type="button" variant="outline" size="icon" className={cn("size-11", CLEAR_OF_BAR)} aria-label={increaseLabel} aria-controls={id} disabled={value >= max} onClick={() => set(value + 1)}>
          <Plus aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

export interface OptionPickerProps {
  group: PricingGroup;
  pick: OptionPick | undefined;
  onPick: (pick: OptionPick) => void;
  error?: string;
  cakeMessageMax: number;
}

function GroupFrame({ group, error, children }: { group: PricingGroup; error?: string; children: ReactNode }) {
  const { t, locale } = useI18n();
  const errorId = `group-${group.id}-error`;
  return (
    <fieldset id={`group-${group.id}`} aria-describedby={error ? errorId : undefined} className="mt-6 min-w-0">
      <legend className="font-semibold">
        {localized(group.name, locale)}{" "}
        <span className={cn("text-sm", group.required ? "font-semibold" : "font-normal text-muted-foreground")}>
          ({t(group.required ? "productOptions.required" : "productOptions.optional")})
        </span>
      </legend>
      {error && (
        <p id={errorId} className="mt-1 font-semibold text-destructive">
          {error}
        </p>
      )}
      {children}
    </fieldset>
  );
}

function SingleChoices({ group, pick, onPick }: OptionPickerProps) {
  const { t, locale } = useI18n();
  const delta = useDelta();
  const name = `option.${group.id}`;
  const chosen = pick?.choiceIds[0] ?? "";
  const choose = (value: string) => onPick({ groupId: group.id, choiceIds: value ? [value] : [] });
  return (
    <div className={cn("mt-2 grid gap-2 min-[30rem]:grid-cols-2 [&_input]:scroll-mb-36 md:[&_input]:scroll-mb-0")}>
      {group.choices.map((choice) => (
        <RadioCard key={choice.id} id={`${name}.${choice.id}`} name={name} value={choice.id} title={localized(choice.name, locale)} hint={delta(choice.priceDeltaRs)} defaultChecked={chosen === choice.id} onChoose={choose} />
      ))}
      {!group.required && <RadioCard id={`${name}.none`} name={name} value="" title={t("productOptions.none")} defaultChecked={chosen === ""} onChoose={choose} />}
    </div>
  );
}

function SeveralChoices({ group, pick, onPick }: OptionPickerProps) {
  const { locale } = useI18n();
  const delta = useDelta();
  const chosen = new Set(pick?.choiceIds ?? []);
  const toggle = (id: string, on: boolean) => {
    const next = group.choices.map((c) => c.id).filter((c) => (c === id ? on : chosen.has(c)));
    onPick({ groupId: group.id, choiceIds: next });
  };
  return (
    <div className="mt-2 grid gap-1">
      {group.choices.map((choice) => (
        <CheckboxRow key={choice.id} name={`option.${group.id}`} value={choice.id} checked={chosen.has(choice.id)} onChange={(event) => toggle(choice.id, event.target.checked)} className={CLEAR_OF_BAR}>
          {localized(choice.name, locale)} {delta(choice.priceDeltaRs) && <span className="text-sm text-muted-foreground">{delta(choice.priceDeltaRs)}</span>}
        </CheckboxRow>
      ))}
    </div>
  );
}

function QuantityChoice({ group, pick, onPick }: OptionPickerProps) {
  const { t, locale } = useI18n();
  const delta = useDelta();
  const unit = group.choices.length === 1 ? group.choices[0] : group.choices.find((c) => c.id === pick?.choiceIds[0]);
  const quantity = pick?.quantity ?? 0;
  const groupName = localized(group.name, locale);
  const update = (next: Partial<OptionPick>) => onPick({ groupId: group.id, choiceIds: unit ? [unit.id] : [], quantity, ...next });
  return (
    <div className="mt-2">
      {group.choices.length > 1 && (
        <div className="mb-3 grid gap-2 min-[30rem]:grid-cols-2 [&_input]:scroll-mb-36 md:[&_input]:scroll-mb-0">
          {group.choices.map((choice) => (
            <RadioCard key={choice.id} id={`option.${group.id}.${choice.id}`} name={`option.${group.id}`} value={choice.id} title={localized(choice.name, locale)} hint={delta(choice.priceDeltaRs)} defaultChecked={unit?.id === choice.id} onChoose={(id) => update({ choiceIds: [id] })} />
          ))}
        </div>
      )}
      <Stepper
        id={`optionQty.${group.id}`}
        name={`optionQty.${group.id}`}
        label={unit ? `${localized(unit.name, locale)}${delta(unit.priceDeltaRs) ? ` (${t("productOptions.eachUnit", { price: delta(unit.priceDeltaRs)! })})` : ""}` : t("productOptions.quantity")}
        value={quantity}
        min={0}
        max={group.quantityMax ?? 99}
        onChange={(value) => update({ quantity: value })}
        decreaseLabel={t("productOptions.decreaseGroup", { name: groupName })}
        increaseLabel={t("productOptions.increaseGroup", { name: groupName })}
      />
    </div>
  );
}

/** One Option picker per group (design-system "Option picker"), by kind. */
export function OptionPicker(props: OptionPickerProps) {
  const { t, locale } = useI18n();
  const { group, pick, onPick, error, cakeMessageMax } = props;
  if (group.kind === "text") {
    const max = group.textMaxLength ?? cakeMessageMax;
    return (
      <div id={`group-${group.id}`}>
        <MessageField
          id={`optionText.${group.id}`}
          name={`optionText.${group.id}`}
          label={localized(group.name, locale)}
          hint={t("productOptions.textHint", { max })}
          max={max}
          value={pick?.text ?? ""}
          onChange={(text) => onPick({ groupId: group.id, choiceIds: [], text })}
          error={error}
          required={group.required}
          requiredLabel={t("productOptions.required")}
        />
      </div>
    );
  }
  return (
    <GroupFrame group={group} error={error}>
      {group.kind === "multiple" ? <SeveralChoices {...props} /> : group.kind === "quantity" ? <QuantityChoice {...props} /> : <SingleChoices {...props} />}
    </GroupFrame>
  );
}
