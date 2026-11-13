// Orders list filters as the page and the loader share them (S-112): the shape, and the links
// that keep or drop one filter. Pure and client-safe; parsing the query string is the contract's
// (`app/server/contracts/orders-list.ts`).

export interface OrderListFilters {
  q: string | null;
  fulfilment: "delivery" | "pickup" | null;
  paid: boolean | null;
  from: string | null;
  to: string | null;
}

export type FilterField = "q" | "from" | "to";
export type FilterProblem = "tooLong" | "badDate" | "toBeforeFrom";

export const NO_FILTERS: OrderListFilters = { q: null, fulfilment: null, paid: null, from: null, to: null };

export function hasFilters(filters: OrderListFilters): boolean {
  return Object.values(filters).some((value) => value !== null);
}

/** The address of a tab with these filters (no cursor), for links and chips. */
export function listHref(tab: string, filters: OrderListFilters): string {
  const params = new URLSearchParams({ tab });
  if (filters.q) params.set("q", filters.q);
  if (filters.fulfilment) params.set("fulfilment", filters.fulfilment);
  if (filters.paid !== null) params.set("paid", String(filters.paid));
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  return `/admin/orders?${params.toString()}`;
}
