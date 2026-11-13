// The Options section's form model (S-048), apart from the editor so the product page can
// post the stored groups and link error paths while the editor chunk loads (NFR-001: the
// editor is lazy, see routes/admin/product.tsx).
import { OPTION_KINDS, type OptionKind, kindHasChoices } from "~/domain/options";
import type { PricedOptionGroup } from "~/domain/option-prices";

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

export interface ChoiceDraft {
  key: string;
  id?: string;
  nameEn: string;
  nameFr: string;
  sign: "+" | "-";
  amount: string;
}

export interface GroupDraft {
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

export const newKey = () => crypto.randomUUID();
const asKind = (kind: string): OptionKind => ((OPTION_KINDS as readonly string[]).includes(kind) ? (kind as OptionKind) : "single");
const text = (value: number | null) => (value === null ? "" : String(value));

export function fromStored(group: StoredOptionGroup): GroupDraft {
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

export const blankChoice = (): ChoiceDraft => ({ key: newKey(), nameEn: "", nameFr: "", sign: "+", amount: "" });

/** The price change as posted: whole rupees with the sign, or the typed text (the server says what is wrong). */
export function delta(choice: ChoiceDraft): number | string {
  const amount = choice.amount.trim();
  if (amount === "") return 0;
  return /^\d+$/.test(amount) ? Number(amount) * (choice.sign === "-" ? -1 : 1) : `${choice.sign === "-" ? "-" : ""}${amount}`;
}

export function toPosted(groups: readonly GroupDraft[]) {
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

export function priced(groups: readonly GroupDraft[]): PricedOptionGroup[] {
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

/** The `optionGroups` field as the editor would post the stored groups untouched. */
export function postedOptionGroups(initial: readonly StoredOptionGroup[]): string {
  return JSON.stringify(toPosted(initial.map(fromStored)));
}
