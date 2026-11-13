import { useI18n } from "~/i18n/react";
import type { OrderLoaderData } from "~/routes/admin/order";
import { Section } from "./sections";

/**
 * The activity log (FR-045, S-125): an ordered list under its heading, oldest first, each entry
 * with its time as `<time datetime>`, already worded in the admin's language by the loader; a
 * reason, a refund note or a total change follow on their own lines. Text is escaped by React.
 */
export function ActivityLog({ events }: { events: OrderLoaderData["events"] }) {
  const { t } = useI18n();
  return (
    <Section id="log-heading" title={t("admin.log.title")}>
      <ol aria-labelledby="log-heading" className="mt-3 grid gap-2 border-s-2 border-input ps-4">
        {events.map((event, index) => (
          <li key={index} className="wrap-anywhere">
            <time dateTime={event.at}>{event.text}</time>
            {event.notes.map((note, n) => (
              <p key={n} className="text-sm whitespace-pre-line">
                {note}
              </p>
            ))}
          </li>
        ))}
      </ol>
    </Section>
  );
}
