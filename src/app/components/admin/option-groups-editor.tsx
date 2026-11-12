// Product editor "Options" section (S-048, spec "Product editor" 6): repeatable group cards
// (sizes, flavours, add-ons, a message) with their choices and price changes. Quick-add
// buttons start a card with a sensible kind and move focus to its name. Groups and choices
// move with buttons or by dragging their grip. The list is posted as one JSON field.
import { ArrowDown, ArrowUp, Check, GripVertical, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { TextField } from "~/components/ui/text-field";
import {
  MAX_OPTION_CHOICES,
  MAX_OPTION_GROUPS,
  OPTION_KINDS,
  OPTION_NAME_MAX,
  OPTION_TEXT_MAX,
  type OptionKind,
  QUICK_ADD,
  type QuickAdd,
  kindHasChoices,
} from "~/domain/options";
import { type PricedOptionGroup, optionsCanGoBelowZero } from "~/domain/pricing";
import { useI18n } from "~/i18n/react";
import { formatRupees } from "~/lib/locale";
import { moveItem, useDragSort } from "~/lib/use-drag-sort";

export interface StoredOptionGroup {
  id: string;
  name: { en: string; fr: string | null };
  kind: string;
  required: boolean;
  textMaxLength: number | null;
  quantityMin: number | null;
  quantityMax: number | null;
  choices: { id: string; name: { en: string; fr: string | null }; priceDeltaRs: number }[];
}

interface ChoiceDraft {
  key: string;
  id?: string;
  nameEn: string;
  nameFr: string;
  sign: "+" | "-";
  amount: string;
}

interface GroupDraft {
  key: string;
  id?: string;
  nameEn: string;
  nameFr: string;
  kind: OptionKind;
  required: boolean;
  textMaxLength: string;
  quantityMin: string;
  quantityMax: string;
  choices: ChoiceDraft[];
}

const newKey = () => crypto.randomUUID();
const asKind = (kind: string): OptionKind => ((OPTION_KINDS as readonly string[]).includes(kind) ? (kind as OptionKind) : "single");
const text = (value: number | null) => (value === null ? "" : String(value));

function fromStored(group: StoredOptionGroup): GroupDraft {
  return {
    key: group.id,
    id: group.id,
    nameEn: group.name.en,
    nameFr: group.name.fr ?? "",
    kind: asKind(group.kind),
    required: group.required,
    textMaxLength: text(group.textMaxLength),
    quantityMin: text(group.quantityMin),
    quantityMax: text(group.quantityMax),
    choices: group.choices.map((c) => ({ key: c.id, id: c.id, nameEn: c.name.en, nameFr: c.name.fr ?? "", sign: c.priceDeltaRs < 0 ? "-" : "+", amount: c.priceDeltaRs === 0 ? "" : String(Math.abs(c.priceDeltaRs)) })),
  };
}

const blankChoice = (): ChoiceDraft => ({ key: newKey(), nameEn: "", nameFr: "", sign: "+", amount: "" });

/** The price change as posted: whole rupees with the sign, or the typed text (the server says what is wrong). */
function delta(choice: ChoiceDraft): number | string {
  const amount = choice.amount.trim();
  if (amount === "") return 0;
  return /^\d+$/.test(amount) ? Number(amount) * (choice.sign === "-" ? -1 : 1) : `${choice.sign === "-" ? "-" : ""}${amount}`;
}

function toPosted(groups: readonly GroupDraft[]) {
  return groups.map((g) => ({
    ...(g.id ? { id: g.id } : {}),
    name: { en: g.nameEn, fr: g.nameFr },
    kind: g.kind,
    required: g.required,
    textMaxLength: g.kind === "text" ? g.textMaxLength : null,
    quantityMin: g.kind === "quantity" ? g.quantityMin : null,
    quantityMax: g.kind === "quantity" ? g.quantityMax : null,
    choices: kindHasChoices(g.kind) ? g.choices.map((c) => ({ ...(c.id ? { id: c.id } : {}), name: { en: c.nameEn, fr: c.nameFr }, priceDeltaRs: delta(c) })) : [],
  }));
}

function priced(groups: readonly GroupDraft[]): PricedOptionGroup[] {
  return groups.map((g) => ({
    kind: g.kind,
    required: g.required,
    quantityMin: Number(g.quantityMin) || null,
    quantityMax: Number(g.quantityMax) || null,
    choices: kindHasChoices(g.kind) ? g.choices.map((c) => ({ priceDeltaRs: typeof delta(c) === "number" ? (delta(c) as number) : 0 })) : [],
  }));
}

/** Element id of an error path, for the error summary's links (AC4). */
export function optionAnchor(field: string): string | undefined {
  const match = /^optionGroups\.(\d+)(?:\.choices\.(\d+))?(?:\.(.+))?$/.exec(field);
  if (!match) return field === "optionGroups" ? "options" : undefined;
  const [, g, c, rest] = match;
  if (c !== undefined) return `group-${g}-choice-${c}-${rest === "priceDeltaRs" ? "amount" : rest === "name.fr" ? "name-fr" : "name-en"}`;
  if (rest === "name.en" || rest === "name.fr") return `group-${g}-${rest.replace(".", "-")}`;
  if (rest === "textMaxLength") return `group-${g}-text-max`;
  if (rest === "quantity") return `group-${g}-qty-min`;
  return `group-${g}`;
}

type Errors = Record<string, string>;
type Announce = (text: string) => void;

interface Labels {
  group: string;
}

function KindChoice({ index, group, onKind }: { index: number; group: GroupDraft; onKind: (kind: OptionKind) => void }) {
  const { t } = useI18n();
  return (
    <fieldset>
      <legend className="font-semibold">{t("admin.product.options.kind")}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {OPTION_KINDS.map((kind) => (
          <label key={kind} className="relative flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md border-2 border-input bg-card px-2 py-2 wrap-anywhere has-checked:border-primary-strong has-checked:bg-accent">
            <input type="radio" name={`group-${index}-kind`} value={kind} checked={group.kind === kind} onChange={() => onKind(kind)} className="peer absolute -inset-0.5 cursor-pointer appearance-none rounded-md" />
            <span aria-hidden="true" className="size-5 shrink-0 rounded-full border-2 border-input bg-card peer-checked:border-[6px] peer-checked:border-primary" />
            <span className="font-semibold">{t(`admin.product.options.kindName.${kind}`)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ChoiceRow(props: {
  gi: number;
  ci: number;
  count: number;
  choice: ChoiceDraft;
  labels: Labels;
  basePrice: number | null;
  showPrice: boolean;
  errors: Errors;
  dragging: boolean;
  handle: ReturnType<ReturnType<typeof useDragSort>["handleProps"]>;
  onChange: (change: Partial<ChoiceDraft>) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  const { t, locale } = useI18n();
  const { gi, ci, count, choice, labels, errors } = props;
  const n = ci + 1;
  const at = `optionGroups.${gi}.choices.${ci}`;
  const id = `group-${gi}-choice-${ci}`;
  const value = delta(choice);
  const pays = props.showPrice && props.basePrice !== null && typeof value === "number" ? props.basePrice + value : null;
  const deltaError = errors[`${at}.priceDeltaRs`];
  return (
    <li data-sort-item="" data-dragging={props.dragging || undefined} className="min-w-0 rounded-md border-2 border-input bg-card p-2 data-dragging:border-primary-strong md:p-3">
      <fieldset>
        <legend className="flex w-full items-center gap-2 font-semibold">
          <span {...props.handle} aria-hidden="true" className="flex size-11 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground active:cursor-grabbing">
            <GripVertical className="size-5" />
          </span>
          <span className="min-w-0 wrap-anywhere">{t("admin.product.options.choiceLegend", { n, group: labels.group })}</span>
        </legend>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          <TextField id={`${id}-name-en`} label={t("admin.product.options.choiceNameEn")} value={choice.nameEn} maxLength={OPTION_NAME_MAX} error={errors[`${at}.name.en`]} autoComplete="off" onChange={(e) => props.onChange({ nameEn: e.currentTarget.value })} />
          <TextField id={`${id}-name-fr`} label={t("admin.product.options.choiceNameFr")} optionalLabel={t("admin.product.optional")} value={choice.nameFr} maxLength={OPTION_NAME_MAX} error={errors[`${at}.name.fr`]} autoComplete="off" onChange={(e) => props.onChange({ nameFr: e.currentTarget.value })} />
        </div>
        <div className="mt-3">
          <label htmlFor={`${id}-amount`} className="block font-semibold">
            {t("admin.product.options.priceChange")}
          </label>
          <p id={`${id}-amount-hint`} className="text-sm text-muted-foreground">
            {pays === null ? t("admin.product.options.priceChangeHint") : t("admin.product.options.customerPays", { price: formatRupees(pays, locale) })}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              aria-label={t("admin.product.options.signLabel", { n, group: labels.group })}
              value={choice.sign}
              onChange={(e) => props.onChange({ sign: e.currentTarget.value === "-" ? "-" : "+" })}
              className="min-h-12 max-w-full min-w-0 rounded-md border-2 border-input bg-card px-2 text-base font-semibold"
            >
              <option value="+">{t("admin.product.options.signAdd")}</option>
              <option value="-">{t("admin.product.options.signTake")}</option>
            </select>
            <span aria-hidden="true" className="font-semibold">
              Rs
            </span>
            <input
              id={`${id}-amount`}
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              placeholder="0"
              value={choice.amount}
              onChange={(e) => props.onChange({ amount: e.currentTarget.value })}
              aria-invalid={deltaError ? true : undefined}
              aria-describedby={deltaError ? `${id}-amount-error` : `${id}-amount-hint`}
              className="block min-h-12 w-28 max-w-full min-w-0 rounded-md border-2 border-input bg-card px-3 py-2 text-base aria-invalid:border-destructive"
            />
          </div>
          {deltaError && (
            <p id={`${id}-amount-error`} className="mt-1 font-semibold text-destructive">
              {deltaError}
            </p>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-1">
          <Button type="button" variant="ghost" size="icon" disabled={ci === 0} onClick={() => props.onMove(ci - 1)} aria-label={t("admin.product.options.moveChoiceEarlier", { n, group: labels.group })}>
            <ArrowUp aria-hidden="true" />
          </Button>
          <Button type="button" variant="ghost" size="icon" disabled={ci === count - 1} onClick={() => props.onMove(ci + 1)} aria-label={t("admin.product.options.moveChoiceLater", { n, group: labels.group })}>
            <ArrowDown aria-hidden="true" />
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={props.onRemove} aria-label={t("admin.product.options.removeChoice", { n, group: labels.group })}>
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      </fieldset>
    </li>
  );
}

function ChoiceList({ gi, group, labels, basePrice, errors, update, announce }: { gi: number; group: GroupDraft; labels: Labels; basePrice: number | null; errors: Errors; update: (change: (g: GroupDraft) => GroupDraft) => void; announce: Announce }) {
  const { t } = useI18n();
  const list = useRef<HTMLOListElement>(null);
  const count = group.choices.length;
  const moveChoice = (from: number, to: number) => update((g) => ({ ...g, choices: moveItem(g.choices, from, to) }));
  const drag = useDragSort({
    container: list,
    onMove: moveChoice,
    onDrop: (_from, to) => announce(t("admin.product.options.announceChoiceMoved", { group: labels.group, n: to + 1, count })),
  });
  const full = count >= MAX_OPTION_CHOICES;
  const problem = errors[`optionGroups.${gi}.choices`];
  return (
    <div className="mt-3">
      <h4 className="font-semibold">{t("admin.product.options.choices")}</h4>
      {count > 0 && (
        <ol ref={list} className="mt-2 grid gap-2" aria-label={t("admin.product.options.choicesOf", { group: labels.group })}>
          {group.choices.map((choice, ci) => (
            <ChoiceRow
              key={choice.key}
              gi={gi}
              ci={ci}
              count={count}
              choice={choice}
              labels={labels}
              basePrice={basePrice}
              showPrice={group.kind === "single"}
              errors={errors}
              dragging={drag.dragging === ci}
              handle={drag.handleProps(ci)}
              onChange={(change) => update((g) => ({ ...g, choices: g.choices.map((c) => (c.key === choice.key ? { ...c, ...change } : c)) }))}
              onMove={(to) => {
                moveChoice(ci, to);
                announce(t("admin.product.options.announceChoiceMoved", { group: labels.group, n: to + 1, count }));
              }}
              onRemove={() => {
                update((g) => ({ ...g, choices: g.choices.filter((c) => c.key !== choice.key) }));
                announce(t("admin.product.options.announceChoiceRemoved", { group: labels.group, n: ci + 1, count: count - 1 }));
              }}
            />
          ))}
        </ol>
      )}
      {problem && <p className="mt-2 font-semibold text-destructive">{problem}</p>}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2"
        disabled={full}
        aria-describedby={full ? `group-${gi}-choices-full` : undefined}
        onClick={() => {
          update((g) => ({ ...g, choices: [...g.choices, blankChoice()] }));
          announce(t("admin.product.options.announceChoiceAdded", { group: labels.group, n: count + 1 }));
        }}
      >
        <Plus aria-hidden="true" />
        {t("admin.product.options.addChoice", { group: labels.group })}
      </Button>
      {full && (
        <p id={`group-${gi}-choices-full`} className="mt-1 text-sm font-semibold">
          {t("admin.product.options.choicesFull", { max: MAX_OPTION_CHOICES })}
        </p>
      )}
    </div>
  );
}

function GroupLimits({ gi, group, errors, cakeMessageMax, update }: { gi: number; group: GroupDraft; errors: Errors; cakeMessageMax: number; update: (change: (g: GroupDraft) => GroupDraft) => void }) {
  const { t } = useI18n();
  if (group.kind === "text") {
    return (
      <TextField
        id={`group-${gi}-text-max`}
        label={t("admin.product.options.textMax")}
        optionalLabel={t("admin.product.optional")}
        hint={t("admin.product.options.textMaxHint", { max: OPTION_TEXT_MAX })}
        placeholder={t("admin.product.options.textMaxDefault", { n: cakeMessageMax })}
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        value={group.textMaxLength}
        error={errors[`optionGroups.${gi}.textMaxLength`]}
        onChange={(e) => {
          const value = e.currentTarget.value;
          update((g) => ({ ...g, textMaxLength: value }));
        }}
        className="max-w-sm"
      />
    );
  }
  if (group.kind !== "quantity") return null;
  const error = errors[`optionGroups.${gi}.quantity`];
  return (
    <div className="grid gap-3 min-[22rem]:grid-cols-2 md:max-w-md">
      <TextField id={`group-${gi}-qty-min`} label={t("admin.product.options.qtyMin")} optionalLabel={t("admin.product.optional")} inputMode="numeric" pattern="[0-9]*" autoComplete="off" value={group.quantityMin} error={error} onChange={(e) => {
        const value = e.currentTarget.value;
        update((g) => ({ ...g, quantityMin: value }));
      }} />
      <TextField id={`group-${gi}-qty-max`} label={t("admin.product.options.qtyMax")} optionalLabel={t("admin.product.optional")} inputMode="numeric" pattern="[0-9]*" autoComplete="off" value={group.quantityMax} onChange={(e) => {
        const value = e.currentTarget.value;
        update((g) => ({ ...g, quantityMax: value }));
      }} />
    </div>
  );
}

function GroupCard(props: {
  gi: number;
  count: number;
  group: GroupDraft;
  basePrice: number | null;
  cakeMessageMax: number;
  errors: Errors;
  dragging: boolean;
  handle: ReturnType<ReturnType<typeof useDragSort>["handleProps"]>;
  update: (change: (g: GroupDraft) => GroupDraft) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
  announce: Announce;
}) {
  const { t } = useI18n();
  const { gi, count, group, errors, update } = props;
  const labels = { group: group.nameEn.trim() || t("admin.product.options.groupN", { n: gi + 1 }) };
  const hasError = Object.keys(errors).some((field) => field === `optionGroups.${gi}` || field.startsWith(`optionGroups.${gi}.`));
  return (
    <li data-sort-item="" data-dragging={props.dragging || undefined} className="min-w-0 rounded-card border-2 border-border bg-card p-2 data-dragging:border-primary-strong data-[invalid]:border-destructive md:p-4" data-invalid={hasError || undefined}>
      <section id={`group-${gi}`} tabIndex={-1} aria-labelledby={`group-${gi}-heading`} className="outline-offset-4">
        <div className="flex flex-wrap items-center gap-2">
          <span {...props.handle} aria-hidden="true" className="flex size-11 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground active:cursor-grabbing">
            <GripVertical className="size-5" />
          </span>
          <h3 id={`group-${gi}-heading`} className="min-w-0 flex-[1_1_8rem] text-lg font-semibold wrap-anywhere">
            {labels.group}
          </h3>
          <div className="flex flex-wrap gap-1">
            <Button type="button" variant="ghost" size="icon" disabled={gi === 0} onClick={() => props.onMove(gi - 1)} aria-label={t("admin.product.options.moveGroupEarlier", labels)}>
              <ArrowUp aria-hidden="true" />
            </Button>
            <Button type="button" variant="ghost" size="icon" disabled={gi === count - 1} onClick={() => props.onMove(gi + 1)} aria-label={t("admin.product.options.moveGroupLater", labels)}>
              <ArrowDown aria-hidden="true" />
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={props.onRemove} aria-label={t("admin.product.options.removeGroup", labels)}>
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
        </div>
        <div className="mt-3 grid gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <TextField id={`group-${gi}-name-en`} label={t("admin.product.options.groupNameEn")} value={group.nameEn} maxLength={OPTION_NAME_MAX} error={errors[`optionGroups.${gi}.name.en`]} autoComplete="off" onChange={(e) => {
              const value = e.currentTarget.value;
              update((g) => ({ ...g, nameEn: value }));
            }} />
            <TextField id={`group-${gi}-name-fr`} label={t("admin.product.options.groupNameFr")} optionalLabel={t("admin.product.optional")} value={group.nameFr} maxLength={OPTION_NAME_MAX} error={errors[`optionGroups.${gi}.name.fr`]} autoComplete="off" onChange={(e) => {
              const value = e.currentTarget.value;
              update((g) => ({ ...g, nameFr: value }));
            }} />
          </div>
          <KindChoice index={gi} group={group} onKind={(kind) => update((g) => ({ ...g, kind, choices: kindHasChoices(kind) && g.choices.length === 0 ? [blankChoice()] : g.choices }))} />
          <label className="relative flex min-h-11 w-fit max-w-full cursor-pointer items-center gap-1.5 rounded-md border-2 border-input bg-card px-2 py-2 wrap-anywhere has-checked:border-primary-strong has-checked:bg-accent">
            {/* The native checkbox covers the whole chip: one 44 px target with its own focus ring. */}
            <input type="checkbox" checked={group.required} onChange={(e) => {
              const required = e.currentTarget.checked;
              update((g) => ({ ...g, required }));
            }} className="peer absolute -inset-0.5 cursor-pointer appearance-none rounded-md" />
            <span aria-hidden="true" className="flex size-5 shrink-0 items-center justify-center rounded-sm border-2 border-input bg-card peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-checked:[&>svg]:block">
              <Check className="hidden size-4" />
            </span>
            <span className="font-semibold">{t("admin.product.options.required")}</span>
          </label>
          <GroupLimits gi={gi} group={group} errors={errors} cakeMessageMax={props.cakeMessageMax} update={update} />
          {errors[`optionGroups.${gi}.kind`] && <p className="font-semibold text-destructive">{errors[`optionGroups.${gi}.kind`]}</p>}
        </div>
        {kindHasChoices(group.kind) && <ChoiceList gi={gi} group={group} labels={labels} basePrice={props.basePrice} errors={errors} update={update} announce={props.announce} />}
      </section>
    </li>
  );
}

export function OptionGroupsEditor({ initial, basePrice, cakeMessageMax, errors, onChange, announce }: { initial: readonly StoredOptionGroup[]; basePrice: number | null; cakeMessageMax: number; errors: Errors; onChange: () => void; announce: Announce }) {
  const { t, locale } = useI18n();
  const [groups, setGroups] = useState<GroupDraft[]>(() => initial.map(fromStored));
  const list = useRef<HTMLOListElement>(null);
  const focusNext = useRef<string | null>(null);
  useEffect(() => {
    if (!focusNext.current) return;
    document.getElementById(focusNext.current)?.focus();
    focusNext.current = null;
  });
  const change = (next: (list: GroupDraft[]) => GroupDraft[]) => {
    setGroups(next);
    onChange();
  };
  const drag = useDragSort({
    container: list,
    onMove: (from, to) => change((l) => moveItem(l, from, to)),
    onDrop: (_from, to) => announce(t("admin.product.options.announceGroupMoved", { n: to + 1, count: groups.length })),
  });
  const full = groups.length >= MAX_OPTION_GROUPS;
  const add = (preset: QuickAdd | null) => {
    const kind = preset ? QUICK_ADD[preset].kind : "single";
    const group: GroupDraft = {
      key: newKey(),
      nameEn: preset ? QUICK_ADD[preset].name.en : "",
      nameFr: preset ? QUICK_ADD[preset].name.fr : "",
      kind,
      required: preset ? QUICK_ADD[preset].required : false,
      textMaxLength: "",
      quantityMin: "",
      quantityMax: "",
      choices: kindHasChoices(kind) ? [blankChoice()] : [],
    };
    focusNext.current = `group-${groups.length}-name-en`;
    change((l) => [...l, group]);
    announce(t("admin.product.options.announceGroupAdded", { group: group.nameEn || t("admin.product.options.groupN", { n: groups.length + 1 }) }));
  };
  const warn = basePrice !== null && optionsCanGoBelowZero(basePrice, priced(groups));
  return (
    <section id="options" tabIndex={-1} aria-labelledby="options-heading" className="outline-offset-4">
      <input type="hidden" name="optionGroups" value={JSON.stringify(toPosted(groups))} />
      <h2 id="options-heading" className="text-xl font-semibold">
        {t("admin.product.options.heading")}
      </h2>
      <p className="text-sm text-muted-foreground">{t("admin.product.options.hint", { price: formatRupees(basePrice ?? 0, locale) })}</p>
      {errors.optionGroups && <p className="mt-2 font-semibold text-destructive">{errors.optionGroups}</p>}
      {warn && (
        <p role="status" className="mt-2 flex items-start gap-2 rounded-md border-2 border-warning p-3 font-semibold">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning" />
          {t("admin.product.options.belowZero")}
        </p>
      )}
      {groups.length > 0 && (
        <ol ref={list} className="mt-3 grid gap-3" aria-label={t("admin.product.options.listLabel")}>
          {groups.map((group, gi) => (
            <GroupCard
              key={group.key}
              gi={gi}
              count={groups.length}
              group={group}
              basePrice={basePrice}
              cakeMessageMax={cakeMessageMax}
              errors={errors}
              dragging={drag.dragging === gi}
              handle={drag.handleProps(gi)}
              update={(fn) => change((l) => l.map((g) => (g.key === group.key ? fn(g) : g)))}
              onMove={(to) => {
                change((l) => moveItem(l, gi, to));
                announce(t("admin.product.options.announceGroupMoved", { n: to + 1, count: groups.length }));
              }}
              onRemove={() => {
                change((l) => l.filter((g) => g.key !== group.key));
                announce(t("admin.product.options.announceGroupRemoved", { group: group.nameEn || t("admin.product.options.groupN", { n: gi + 1 }) }));
              }}
              announce={announce}
            />
          ))}
        </ol>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {(Object.keys(QUICK_ADD) as QuickAdd[]).map((preset) => (
          <Button key={preset} type="button" variant="outline" size="sm" disabled={full} aria-describedby={full ? "options-full" : undefined} onClick={() => add(preset)}>
            {t(`admin.product.options.quick.${preset}`)}
          </Button>
        ))}
        <Button type="button" variant="outline" size="sm" disabled={full} aria-describedby={full ? "options-full" : undefined} onClick={() => add(null)}>
          <Plus aria-hidden="true" />
          {t("admin.product.options.addGroup")}
        </Button>
      </div>
      {full && (
        <p id="options-full" className="mt-1 text-sm font-semibold">
          {t("admin.product.options.groupsFull", { max: MAX_OPTION_GROUPS })}
        </p>
      )}
    </section>
  );
}
