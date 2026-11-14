// `eveningReminder` (S-198, FR-072; contracts.md "Scheduled jobs"): from the hour of
// `settings.evening_reminder_at` (18:00 by default) until 21:00 Mauritius time, the first tick
// claims `job_run('evening_reminder', todayMU)` and pushes "Tomorrow: n orders" to every admin
// with push on, opening tomorrow's prep list. n counts *confirmed* orders (approved..completed),
// the same set as the prep list (AC5). n = 0 sends nothing but still claims the day (AC2,
// Owner Q14). The run key makes a second tick that evening a no-op (AC3). Everything is judged
// in Mauritius time from the tick's `now`, never the server clock (AC8). No email (AC1).
// While push is not configured nothing is claimed.
import { sql } from "drizzle-orm";
import { CONFIRMED_STATUSES } from "~/domain/status";
import { addDays, instantToMuDateTime } from "~/domain/time";
import { eveningReminderPayload } from "~/server/notify/push-text.server";
import { sendPushes } from "~/server/push/push.server";
import { pushRecipients } from "~/server/push/subscriptions.server";
import type { JobContext, JobResult } from "./types";

/** A missed tick may still send until this Mauritius time (AC4). */
export const EVENING_REMINDER_UNTIL = "21:00";
const JOB = "eveningReminder";

/** True when `time` (HH:mm, MU) is inside the reminder window that opens at `opensAt`. */
export function inReminderWindow(time: string, opensAt: string): boolean {
  // An Owner who picks 21:00 or later still gets one evening tick (until midnight).
  const closesAt = opensAt >= EVENING_REMINDER_UNTIL ? "24:00" : EVENING_REMINDER_UNTIL;
  return time >= opensAt && time < closesAt;
}

async function claimDay(context: JobContext, today: string): Promise<boolean> {
  const { rows } = (await context.db.execute(sql`
    insert into job_run (job, run_key, ran_at) values ('evening_reminder', ${today}, ${context.now.toISOString()}::timestamptz)
    on conflict do nothing returning 1 as claimed
  `)) as unknown as { rows: unknown[] };
  return rows.length > 0;
}

async function confirmedOrders(context: JobContext, date: string): Promise<number> {
  const statuses = JSON.stringify([...CONFIRMED_STATUSES]);
  const { rows } = (await context.db.execute(sql`
    select count(*)::int as n from orders
    where fulfil_on = ${date}::date and status in (select value::order_status from json_array_elements_text(${statuses}::json))
  `)) as unknown as { rows: { n: number }[] };
  return rows[0]?.n ?? 0;
}

export async function eveningReminder(context: JobContext): Promise<JobResult> {
  const pusher = context.pusher;
  if (!pusher) return { job: JOB, ran: true, processed: 0 };
  const local = instantToMuDateTime(context.now);
  const [today, time] = [local.slice(0, 10), local.slice(11, 16)];
  const { rows } = (await context.db.execute(sql`select evening_reminder_at as "opensAt" from settings limit 1`)) as unknown as { rows: { opensAt: string }[] };
  const opensAt = rows[0]?.opensAt ?? "18:00";
  if (!inReminderWindow(time, opensAt) || !(await claimDay(context, today))) return { job: JOB, ran: true, processed: 0 };
  const tomorrow = addDays(today, 1);
  const count = await confirmedOrders(context, tomorrow);
  if (count === 0) return { job: JOB, ran: true, processed: 0 };
  const jobs = (await pushRecipients(context.db)).map(({ device, locale }) => ({ device, payload: eveningReminderPayload(count, tomorrow, locale) }));
  const report = await sendPushes(context.db, pusher, "evening_reminder", jobs, context.now);
  return { job: JOB, ran: true, processed: report.sent };
}
