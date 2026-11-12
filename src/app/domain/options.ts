// Product option groups (S-048, FR-062): sizes, flavours, add-ons, a message. Pure rules
// shared by the editor (limits, quick-add presets) and the save service (validation).
// A choice's price change is added to the base price: a cake card per flavour with a
// required "Size" group (6 inch Rs 0, 7 inch +Rs 300, 8 inch +Rs 600) prices each size.

export const OPTION_KINDS = ["single", "multiple", "text", "quantity"] as const;
export type OptionKind = (typeof OPTION_KINDS)[number];

/** Owner answer Q18 ("enough"). */
export const MAX_OPTION_GROUPS = 10;
export const MAX_OPTION_CHOICES = 30;
export const OPTION_NAME_MAX = 120;
/** Text groups: blank = the Settings cake message length; never more than this. */
export const OPTION_TEXT_MAX = 200;
export const PRICE_DELTA_MAX_RS = 100_000;
/** Quantity groups count units across their choices (OptionPick.quantity is at most 99). */
export const OPTION_QUANTITY_MAX = 99;

export interface OptionChoiceInput {
  id?: string;
  name: { en: string; fr: string | null };
  priceDeltaRs: number;
}

export interface OptionGroupInput {
  id?: string;
  name: { en: string; fr: string | null };
  kind: OptionKind;
  required: boolean;
  textMaxLength: number | null;
  quantityMin: number | null;
  quantityMax: number | null;
  choices: OptionChoiceInput[];
}

/**
 * Quick-add buttons (AC1): the kind each starts with, whether it is required, and the group
 * name it starts with in both languages (the product's content, not the admin's UI language).
 */
export const QUICK_ADD = {
  size: { kind: "single", required: true, name: { en: "Size", fr: "Taille" } },
  flavour: { kind: "single", required: false, name: { en: "Flavour", fr: "Parfum" } },
  addons: { kind: "multiple", required: false, name: { en: "Add-ons", fr: "Suppléments" } },
  message: { kind: "text", required: false, name: { en: "Message", fr: "Message" } },
} as const satisfies Record<string, { kind: OptionKind; required: boolean; name: { en: string; fr: string } }>;
export type QuickAdd = keyof typeof QUICK_ADD;

/** Kinds whose customer picks are choices (a text group has none). */
export const kindHasChoices = (kind: OptionKind) => kind !== "text";

export type OptionProblem = "missing" | "invalid" | "none" | "too_many";
/** Field path (`optionGroups.2.choices.0.name.en`) -> problem. */
export type OptionProblems = Record<string, OptionProblem>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Raw = Record<string, unknown>;
const isObject = (value: unknown): value is Raw => typeof value === "object" && value !== null && !Array.isArray(value);
const trimmed = (value: unknown) => (typeof value === "string" ? value.trim() : null);

function checkName(raw: unknown, at: string, problems: OptionProblems): { en: string; fr: string | null } {
  const name = isObject(raw) ? raw : {};
  const en = trimmed(name.en) ?? "";
  const fr = trimmed(name.fr) ?? "";
  if (en === "") problems[`${at}.name.en`] = "missing";
  else if (en.length > OPTION_NAME_MAX) problems[`${at}.name.en`] = "invalid";
  if (name.fr !== undefined && name.fr !== null && typeof name.fr !== "string") problems[`${at}.name.fr`] = "invalid";
  else if (fr.length > OPTION_NAME_MAX) problems[`${at}.name.fr`] = "invalid";
  return { en, fr: fr === "" ? null : fr };
}

/** null for blank; NaN for anything that is not a whole number in range. */
function wholeOrBlank(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "string" && /^\s*-?\d+\s*$/.test(value) ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) && n >= min && n <= max ? n : Number.NaN;
}

const optionalId = (value: unknown) => (typeof value === "string" && UUID.test(value) ? value.toLowerCase() : undefined);

function checkChoice(raw: unknown, at: string, problems: OptionProblems): OptionChoiceInput {
  const choice = isObject(raw) ? raw : {};
  const name = checkName(choice.name, at, problems);
  const delta = wholeOrBlank(choice.priceDeltaRs ?? 0, -PRICE_DELTA_MAX_RS, PRICE_DELTA_MAX_RS);
  if (Number.isNaN(delta)) problems[`${at}.priceDeltaRs`] = "invalid";
  const id = optionalId(choice.id);
  return { ...(id ? { id } : {}), name, priceDeltaRs: delta === null || Number.isNaN(delta) ? 0 : delta };
}

function checkLimits(group: Raw, kind: OptionKind, at: string, problems: OptionProblems) {
  const textMaxLength = kind === "text" ? wholeOrBlank(group.textMaxLength, 1, OPTION_TEXT_MAX) : null;
  if (Number.isNaN(textMaxLength)) problems[`${at}.textMaxLength`] = "invalid";
  let quantityMin = kind === "quantity" ? wholeOrBlank(group.quantityMin, 0, OPTION_QUANTITY_MAX) : null;
  let quantityMax = kind === "quantity" ? wholeOrBlank(group.quantityMax, 1, OPTION_QUANTITY_MAX) : null;
  const bad = Number.isNaN(quantityMin) || Number.isNaN(quantityMax) || (quantityMin === null) !== (quantityMax === null) || (quantityMin !== null && quantityMax !== null && quantityMin > quantityMax);
  if (bad) {
    problems[`${at}.quantity`] = "invalid";
    quantityMin = quantityMax = null;
  }
  return { textMaxLength: Number.isNaN(textMaxLength) ? null : textMaxLength, quantityMin, quantityMax };
}

function checkGroup(raw: unknown, index: number, problems: OptionProblems): OptionGroupInput {
  const at = `optionGroups.${index}`;
  const group = isObject(raw) ? raw : {};
  const name = checkName(group.name, at, problems);
  const kind = (OPTION_KINDS as readonly unknown[]).includes(group.kind) ? (group.kind as OptionKind) : null;
  if (!kind) problems[`${at}.kind`] = "invalid";
  const rawChoices = Array.isArray(group.choices) ? group.choices : [];
  const choices = kind && kindHasChoices(kind) ? rawChoices.slice(0, MAX_OPTION_CHOICES + 1).map((c, j) => checkChoice(c, `${at}.choices.${j}`, problems)) : [];
  if (kind && kindHasChoices(kind) && choices.length === 0) problems[`${at}.choices`] = "none";
  if (choices.length > MAX_OPTION_CHOICES) problems[`${at}.choices`] = "too_many";
  const id = optionalId(group.id);
  return {
    ...(id ? { id } : {}),
    name,
    kind: kind ?? "single",
    required: group.required === true || group.required === "true",
    ...checkLimits(group, kind ?? "single", at, problems),
    choices,
  };
}

/**
 * Checks the posted groups (AC2-AC5): every problem at once, keyed by field path.
 * Pick-one, pick-several and quantity groups need at least one choice (a required group
 * with none could never be satisfied); text groups take no choices.
 */
export function checkOptionGroups(raw: unknown): { groups: OptionGroupInput[]; problems: OptionProblems } {
  const problems: OptionProblems = {};
  if (!Array.isArray(raw)) return { groups: [], problems: { optionGroups: "invalid" } };
  if (raw.length > MAX_OPTION_GROUPS) return { groups: [], problems: { optionGroups: "too_many" } };
  const groups = raw.map((group, i) => checkGroup(group, i, problems));
  return { groups, problems };
}
