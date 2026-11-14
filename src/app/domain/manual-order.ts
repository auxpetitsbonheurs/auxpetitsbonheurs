// Manual orders' relaxed rules (FR-056, admin-manual-orders spec; owner Q8 sold out allowed, Q9
// past dates allowed, Q21 the largest item notice): nothing about the date or a sold-out product
// stops an admin, it only warns. Pure, shared by the form (live warnings) and `create`.
import { type AvailabilityRules, adminDateWarnings } from "./availability";
import { addDays, isValidMuDate } from "./time";

export type ManualWarning = "blocked" | "closed" | "too_soon" | "past_date" | "sold_out";

/** Admin horizon forward (contracts `days: DayStatus[365]`). */
export const MANUAL_HORIZON_DAYS = 365;

export function manualOrderWarnings(input: { date: string; today: string; rules: AvailabilityRules; noticeDays: number; soldOut: boolean }): ManualWarning[] {
  const warnings: ManualWarning[] = input.date < input.today ? ["past_date"] : adminDateWarnings(input.date, { ...input.rules, today: input.today }, input.noticeDays);
  return input.soldOut ? [...warnings, "sold_out"] : warnings;
}

/** Why a date cannot be used at all, or null: a real calendar date, at most 365 days ahead (S-134 AC6). */
export function manualDateProblem(date: string, today: string): "invalid" | "too_far" | null {
  if (!isValidMuDate(date)) return "invalid";
  return date > addDays(today, MANUAL_HORIZON_DAYS) ? "too_far" : null;
}

/** The order's confirmation email goes only with an email and a date not in the past (S-135 AC1-AC3, owner 2026-11-10). */
export function sendsConfirmation(email: string | null | undefined, date: string, today: string): boolean {
  return Boolean(email) && date >= today;
}
