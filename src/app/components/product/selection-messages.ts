// Words for a selection issue (domain/pricing validateSelection), shared by the product page
// in the browser and the addToBasket action on the server, so both say the same thing.
import type { LocalizedName, PricingGroup, SelectionIssue } from "~/domain/pricing";
import { localized } from "~/i18n/localized";
import type { Locale } from "~/lib/locale";

type T = (key: string, values?: Record<string, string | number>) => string;

/** "Choose a size": English reads the group name in lower case inside the sentence. */
function groupWord(name: LocalizedName, locale: Locale): string {
  const text = localized(name, locale);
  return locale === "en" ? text.toLowerCase() : text;
}

function requiredMessage(group: PricingGroup, t: T, locale: Locale): string {
  const values = { group: groupWord(group.name, locale) };
  if (group.kind === "multiple") return t("productOptions.chooseSome", values);
  if (group.kind === "quantity") return t("productOptions.chooseHowMany", values);
  if (group.kind === "text") return t("productOptions.fillIn", values);
  return t("productOptions.chooseOne", values);
}

export function issueMessage(issue: SelectionIssue, groups: readonly PricingGroup[], t: T, locale: Locale): string {
  const group = groups.find((g) => g.id === issue.groupId);
  switch (issue.code) {
    case "quantity":
      return t("productOptions.errors.quantity");
    case "below_min":
      return t("productOptions.errors.belowMin", { min: issue.limit ?? 1 });
    case "too_long":
      return t("productOptions.errors.tooLong", { max: issue.limit ?? 0 });
    case "required":
      return group ? requiredMessage(group, t, locale) : t("productOptions.errors.changed");
    default:
      return t("productOptions.errors.changed");
  }
}

/** One message per field (the first issue of each), keyed `quantity`, `cakeMessage` or `options.<groupId>`. */
export function issueFields(issues: readonly SelectionIssue[], groups: readonly PricingGroup[], t: T, locale: Locale): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of issues) fields[issue.field] ??= issueMessage(issue, groups, t, locale);
  return fields;
}
