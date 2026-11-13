// Choosing the checkout date in e2e specs (S-087): with JavaScript the calendar (a day by its
// accessible name, moving month by month), without it the native date field.
import { type Page, expect } from "@playwright/test";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "2026-11-24" -> "Tuesday 24 November", the day's name in the English calendar. */
export function spokenDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export async function chooseDate(page: Page, date: string, options: { js?: boolean; locale?: "en" | "fr" } = {}) {
  if (options.js === false) {
    await page.getByLabel("Date", { exact: true }).fill(date);
    return;
  }
  const grid = page.getByRole("grid");
  await expect(grid).toBeVisible();
  const day = grid.locator(`[data-date="${date}"]`);
  const next = page.getByRole("button", { name: options.locale === "fr" ? "Mois suivant" : "Next month" });
  for (let i = 0; i < 4 && (await day.count()) === 0; i += 1) await next.click();
  await day.click();
  await expect(page.locator('input[type="hidden"][name="date"]')).toHaveValue(date);
}
