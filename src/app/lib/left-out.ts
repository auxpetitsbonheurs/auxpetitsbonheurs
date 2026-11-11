// Naming what is left out of an order (UX audit H1): used by the stale-submit note on the
// basket page and the confirmation alert. Pure; runs in the browser and in the Worker.
import type { LocalizedName } from "~/domain/pricing";
import { localized } from "~/i18n/localized";
import type { Locale } from "./locale";

interface MaybeLeftOutLine {
  productId: string;
  name?: LocalizedName;
  problem: string | null;
}

/** Names (page language) of the lines that will not be ordered, once each, in basket order. */
export function leftOutNames(lines: readonly MaybeLeftOutLine[], locale: Locale): string[] {
  const names = lines.flatMap((line) => (line.problem !== null && line.name ? [localized(line.name, locale)] : []));
  return [...new Set(names)];
}

/** "Tart, Pie, and Plum" / "Tarte et Flan". */
export function nameList(names: readonly string[], locale: Locale): string {
  return new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(names);
}
