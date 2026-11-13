// How a stored order option (order_item.options, FR-012 snapshot) reads on the tracking page
// and the admin order screens: the choice ("8 inch"), with its count for a quantity group
// ("Cupcake × 3"), or the group and the customer's text ("Name: Zoé").
import type { LocalizedText, OrderItemOption } from "~/db/schema";

export function orderOptionLabel(option: OrderItemOption): LocalizedText | null {
  if (option.text !== undefined) {
    return { en: `${option.group.en}: ${option.text}`, ...(option.group.fr ? { fr: `${option.group.fr} : ${option.text}` } : {}) };
  }
  if (!option.choice) return null;
  if (option.kind === "quantity" && option.quantity) {
    return { en: `${option.choice.en} × ${option.quantity}`, ...(option.choice.fr ? { fr: `${option.choice.fr} × ${option.quantity}` } : {}) };
  }
  return option.choice;
}

export const orderOptionLabels = (options: readonly OrderItemOption[]): { label: LocalizedText }[] =>
  options.flatMap((option) => {
    const label = orderOptionLabel(option);
    return label ? [{ label }] : [];
  });
