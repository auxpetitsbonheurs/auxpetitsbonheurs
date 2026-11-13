// `admin/orders` query string (contracts.md `admin/orders`, S-111, S-112): `tab`, `q`, `fulfilment`,
// `paid`, `from`/`to` (or `date` for one day), `cursor`, `limit`. Filters are read field by field:
// a bad field is reported on that field and left out, so the list stays as it was (S-112 AC4).
import { z } from "zod";
import { ORDER_QUERY_MAX } from "~/domain/order-search";
import { type FilterField, type FilterProblem, NO_FILTERS, type OrderListFilters, hasFilters, listHref } from "~/domain/order-list-filters";
import { Fulfilment, MuDate } from "./shared";

export { type FilterField, type FilterProblem, NO_FILTERS, type OrderListFilters, hasFilters, listHref };

function dateParam(raw: string | null): { value: string | null; bad: boolean } {
  if (!raw) return { value: null, bad: false };
  return MuDate.safeParse(raw).success ? { value: raw, bad: false } : { value: null, bad: true };
}

/** The filters to apply and the problems to show beside their fields. */
export function parseListFilters(search: URLSearchParams): { filters: OrderListFilters; problems: Partial<Record<FilterField, FilterProblem>> } {
  const problems: Partial<Record<FilterField, FilterProblem>> = {};
  const rawQ = (search.get("q") ?? "").trim();
  if (rawQ.length > ORDER_QUERY_MAX) problems.q = "tooLong";
  const fulfilment = Fulfilment.safeParse(search.get("fulfilment"));
  const paid = search.get("paid");
  const single = search.get("date");
  let from = dateParam(search.get("from") ?? single);
  let to = dateParam(search.get("to") ?? single);
  if (from.bad) problems.from = "badDate";
  if (to.bad) problems.to = "badDate";
  if (from.value && to.value && from.value > to.value) {
    problems.to = "toBeforeFrom";
    from = { value: null, bad: false };
    to = { value: null, bad: false };
  }
  return {
    filters: {
      q: rawQ === "" || problems.q ? null : rawQ,
      fulfilment: fulfilment.success ? fulfilment.data : null,
      paid: paid === "true" ? true : paid === "false" ? false : null,
      from: from.value,
      to: to.value,
    },
    problems,
  };
}

/** Keyset cursor: the sort key of the last row shown (date, window start, number). */
export const ListCursor = z.object({ d: MuDate.optional(), w: z.string().regex(/^\d{2}:\d{2}$/).optional(), n: z.number().int().min(1).max(999_999_999) });
export type ListCursor = z.infer<typeof ListCursor>;

const toBase64Url = (text: string) => btoa(text).replace(/=+$/, "").replaceAll("+", "-").replaceAll("/", "_");

export function encodeListCursor(cursor: ListCursor): string {
  return toBase64Url(JSON.stringify(cursor));
}

/** The cursor, null when absent, or "invalid" (S-111 AC4: VALIDATION_FAILED). */
export function decodeListCursor(raw: string | null): ListCursor | null | "invalid" {
  if (!raw) return null;
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(raw)) return "invalid";
  try {
    const parsed = ListCursor.safeParse(JSON.parse(atob(raw.replaceAll("-", "+").replaceAll("_", "/"))));
    return parsed.success ? parsed.data : "invalid";
  } catch {
    return "invalid";
  }
}
