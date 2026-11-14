// The workshop part of an order screen (E-15 S-305 AC3): the event (link to its admin screen),
// address, cakes, the people's names and the allergies, highlighted. Allergies are health data:
// shown here and on the event's list to admins only, never in alerts.
import { TriangleAlert } from "lucide-react";
import { Link } from "react-router";
import { useI18n } from "~/i18n/react";
import { Fact, Section } from "./sections";

export interface OrderWorkshopView {
  eventId: string;
  title: string;
  address: string;
  cakes: number;
  peopleNames: string | null;
  allergies: string | null;
}

export function AllergyBadge({ allergies }: { allergies: string | null }) {
  const { t } = useI18n();
  if (!allergies) return <span>{t("admin.workshops.allergiesNone")}</span>;
  return (
    <span className="inline-flex items-start gap-2 rounded-md border-2 border-destructive bg-destructive/10 px-2 py-1 font-semibold text-foreground">
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
      <span className="min-w-0 wrap-anywhere">
        <span className="sr-only">{t("admin.workshops.allergiesLabel")}: </span>
        {allergies}
      </span>
    </span>
  );
}

export function WorkshopSection({ workshop, dateLabel, timeLabel }: { workshop: OrderWorkshopView; dateLabel: string; timeLabel: string }) {
  const { t } = useI18n();
  return (
    <Section id="order-workshop" title={t("admin.workshops.orderSection")}>
      <dl className="mt-3 grid gap-3">
        <Fact term={t("admin.workshops.event")}>
          <Link to={`/admin/workshops/${workshop.eventId}`} className="inline-flex min-h-11 items-center font-semibold link">
            {workshop.title}
          </Link>
        </Fact>
        <Fact term={t("admin.workshops.when")}>{`${dateLabel}, ${timeLabel}`}</Fact>
        <Fact term={t("admin.workshops.address")}>{workshop.address}</Fact>
        <Fact term={t("admin.workshops.cakes")}>{t("admin.workshops.cakesCount", { count: workshop.cakes })}</Fact>
        <Fact term={t("admin.workshops.people")}>{workshop.peopleNames ?? "—"}</Fact>
        <Fact term={t("admin.workshops.allergiesLabel")}>
          <AllergyBadge allergies={workshop.allergies} />
        </Fact>
      </dl>
    </Section>
  );
}
