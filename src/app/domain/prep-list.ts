// Prep list (FR-060, admin-calendar-prep spec "Prep list"): what to make on one Mauritius day,
// grouped by product (menu order) then variant (option labels joined " · "), identical lines
// merged with their quantities summed and each message kept as its own quoted line. Free-text
// manual items group under "Other". Only *confirmed* orders count (owner decision 3). Carries no
// customer data at all (NFR-004): the input has none.
import type { OrderItemOption } from "~/db/tables/json-types";
import type { Locale } from "~/lib/locale";
import type { OrderStatus } from "./status";

/** approved..completed (README decision 5, *confirmed* group). */
export const PREP_STATUSES = ["approved", "in_preparation", "ready_for_pickup", "out_for_delivery", "completed"] as const satisfies readonly OrderStatus[];

export interface PrepItem {
  orderId: string;
  /** null for a free-text manual item (or a deleted product's snapshot). */
  productId: string | null;
  /** The product's menu position; null when it has none (free text, deleted). */
  productSort: number | null;
  name: { en: string; fr?: string | null };
  options: readonly OrderItemOption[];
  cakeMessage: string | null;
  quantity: number;
}

export interface PrepVariant {
  label: string;
  quantity: number;
  orderCount: number;
  messages: string[];
}

export interface PrepGroup {
  product: string;
  variants: PrepVariant[];
}

export interface PrepList {
  summary: { orders: number; items: number };
  groups: PrepGroup[];
}

const pick = (text: { en: string; fr?: string | null }, locale: Locale) => (locale === "fr" && text.fr && text.fr.trim() !== "" ? text.fr : text.en);

/** A choice ("8 inch", "Cupcake × 3"); text options are messages, not variants. */
function choiceLabel(option: OrderItemOption, locale: Locale): string | null {
  if (option.text !== undefined || !option.choice) return null;
  const choice = pick(option.choice, locale);
  return option.kind === "quantity" && option.quantity ? `${choice} × ${option.quantity}` : choice;
}

function itemMessages(item: PrepItem, locale: Locale): string[] {
  const texts = item.options.flatMap((option) => (option.text !== undefined && option.text.trim() !== "" ? [`${pick(option.group, locale)}${locale === "fr" ? " : " : ": "}${option.text}`] : []));
  return item.cakeMessage && item.cakeMessage.trim() !== "" ? [...texts, item.cakeMessage] : texts;
}

const OTHER = "\u0000other";
const OTHER_LABEL: Record<Locale, string> = { en: "Other", fr: "Autres" };

interface Bucket {
  product: string;
  sort: number;
  variants: Map<string, PrepVariant & { orders: Set<string> }>;
}

function bucketFor(groups: Map<string, Bucket>, item: PrepItem, locale: Locale): Bucket {
  const key = item.productId ?? OTHER;
  let bucket = groups.get(key);
  if (!bucket) {
    bucket = { product: item.productId ? pick(item.name, locale) : OTHER_LABEL[locale], sort: item.productId ? (item.productSort ?? Number.MAX_SAFE_INTEGER - 1) : Number.MAX_SAFE_INTEGER, variants: new Map() };
    groups.set(key, bucket);
  }
  return bucket;
}

export function buildPrepList(items: readonly PrepItem[], locale: Locale): PrepList {
  const groups = new Map<string, Bucket>();
  for (const item of items) {
    const bucket = bucketFor(groups, item, locale);
    const label = item.productId ? item.options.flatMap((o) => choiceLabel(o, locale) ?? []).join(" · ") : pick(item.name, locale);
    const variant = bucket.variants.get(label) ?? { label, quantity: 0, orderCount: 0, messages: [], orders: new Set<string>() };
    variant.quantity += item.quantity;
    variant.orders.add(item.orderId);
    variant.messages.push(...itemMessages(item, locale));
    bucket.variants.set(label, variant);
  }
  const sorted = [...groups.values()].sort((a, b) => a.sort - b.sort || a.product.localeCompare(b.product, locale));
  return {
    summary: { orders: new Set(items.map((item) => item.orderId)).size, items: items.reduce((sum, item) => sum + item.quantity, 0) },
    groups: sorted.map((bucket) => ({
      product: bucket.product,
      variants: [...bucket.variants.values()]
        .sort((a, b) => a.label.localeCompare(b.label, locale))
        .map(({ orders, ...variant }) => ({ ...variant, orderCount: orders.size })),
    })),
  };
}

const HEADINGS: Record<Locale, { title: string; orders: (n: number) => string; items: (n: number) => string }> = {
  en: { title: "Prep list", orders: (n) => `${n} ${n === 1 ? "order" : "orders"}`, items: (n) => `${n} ${n === 1 ? "item" : "items"}` },
  fr: { title: "Liste de préparation", orders: (n) => `${n} ${n === 1 ? "commande" : "commandes"}`, items: (n) => `${n} ${n === 1 ? "article" : "articles"}` },
};

/** The plain-text copy for Share (S-140 AC1): same grouping, built on the server in the admin's language. */
export function prepShareText(list: PrepList, labels: { dateLabel: string; generatedLabel: string; locale: Locale }): string {
  const words = HEADINGS[labels.locale];
  const lines = [`${words.title} · ${labels.dateLabel}`, `${words.orders(list.summary.orders)}, ${words.items(list.summary.items)}`];
  for (const group of list.groups) {
    lines.push("", group.product);
    for (const variant of group.variants) {
      lines.push(`- ${variant.quantity} ×${variant.label ? ` ${variant.label}` : ""}`);
      lines.push(...variant.messages.map((message) => `  "${message}"`));
    }
  }
  lines.push("", labels.generatedLabel);
  return lines.join("\n");
}
