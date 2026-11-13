// Basket lines as the basket page shows them (ADR-0004, S-066): priced from the newest menu
// copy, with each line's chosen options and message, and the calm notes of stale items.
// Kept apart from the route module so checkout steps and line display change independently.
import type { BasketLine } from "~/domain/basket";
import type { Menu, PriceNote } from "~/domain/menu";
import type { LocalizedName, PricedLine, PricedOption } from "~/domain/pricing";
import { localized } from "~/i18n/localized";
import { type Locale, formatRupees } from "~/lib/locale";
import type { BasketLineView } from "./basket-line-item";

type T = (key: string, values?: Record<string, string | number>) => string;

/** One chosen option in words: "8 inch", "Extra cupcake × 3", "Name: Zoé". */
export function optionText(option: Pick<PricedOption, "kind" | "group" | "label" | "quantity" | "text">, t: T, locale: Locale): string {
  if (option.text !== undefined) return t("basket.optionText", { group: localized(option.group, locale), text: option.text });
  const label = localized(option.label, locale);
  return option.kind === "quantity" && option.quantity ? t("basket.optionQuantity", { name: label, count: option.quantity }) : label;
}

/** What the line says under its name: options, then the cake message. */
export function lineDetails(line: Pick<PricedLine, "options" | "cakeMessage">, t: T, locale: Locale): string[] {
  const details = line.options.map((o) => optionText(o, t, locale));
  if (line.cakeMessage) details.push(t("basket.cakeMessage", { text: line.cakeMessage }));
  return details;
}

export interface LineViewSources {
  basket: readonly BasketLine[];
  lines: readonly PricedLine[];
  menu: Menu;
  notes: ReadonlyMap<string, PriceNote>;
  goneName: (productId: string) => LocalizedName | undefined;
  /** The line's "Price updated" note (domain/menu-pricing linePriceNote), once that module is loaded. */
  noteFor?: (line: BasketLine, note: PriceNote | undefined, product: Menu["products"][number] | undefined) => { fromRs: number; toRs: number } | null;
}

export function basketLineViews({ basket, lines, menu, notes, goneName, noteFor }: LineViewSources, t: T, locale: Locale): BasketLineView[] {
  const products = new Map(menu.products.map((p) => [p.id, p]));
  const stored = new Map(basket.map((l) => [l.lineId, l]));
  return lines.map((line): BasketLineView => {
    const product = products.get(line.productId);
    const name = product?.name ?? goneName(line.productId);
    const source = stored.get(line.lineId);
    const note = source && noteFor && line.problem === null ? noteFor(source, notes.get(line.productId), product) : null;
    return {
      lineId: line.lineId,
      name: name ? localized(name, locale) : t("basket.unavailableItem"),
      // 56 px thumbnail: the smallest stored copy when there is one (S-276).
      imageUrl: product?.photos[0]?.thumbUrl ?? product?.photos[0]?.url ?? null,
      details: lineDetails(line, t, locale),
      quantity: line.quantity,
      // The stepper stops at the product's minimum (S-085 AC4), so a line is never dropped by a tap.
      minQuantity: product?.minQuantity ?? 1,
      unitPrice: formatRupees(line.unitPriceRs),
      wasUnitPrice: line.promotionId && line.originalUnitPriceRs > line.unitPriceRs ? formatRupees(line.originalUnitPriceRs) : null,
      lineTotal: formatRupees(line.lineTotalRs),
      unavailable: line.problem !== null,
      optionsChanged: line.problem === "options_changed",
      nameUnknown: !name,
      priceNote: note ? t("basket.priceUpdated", { old: formatRupees(note.fromRs), new: formatRupees(note.toRs) }) : null,
    };
  });
}
