// An event's registrations on its admin screen (E-15 S-305 AC1, S-306 AC1): each with number,
// name, status, cakes and choices, total, the people's names and the allergies (highlighted),
// a link to the order (Accept, Refuse and Payment received live there), and after a cancelled
// event a WhatsApp link per registrant. Totals per cake option count active registrations only.
import { ChevronRight, MessageCircle } from "lucide-react";
import { Link } from "react-router";
import { PaidTag } from "~/components/admin/order/header";
import { AllergyBadge } from "~/components/admin/order/workshop-section";
import { StatusBadge } from "~/components/order/status-badge";
import type { OrderStatus } from "~/domain/status";
import { useI18n } from "~/i18n/react";
import { formatRupees } from "~/lib/locale";

export interface RegistrationView {
  orderId: string;
  number: string;
  status: OrderStatus;
  paid: boolean;
  active: boolean;
  contactName: string;
  cakes: number;
  choices: string[];
  totalRs: number;
  peopleNames: string | null;
  allergies: string | null;
  message: string | null;
  whatsappUrl: string | null;
}

export function OptionTotals({ totals }: { totals: { name: string; cakes: number }[] }) {
  const { t } = useI18n();
  if (totals.length === 0) return null;
  return (
    <ul aria-label={t("admin.workshops.totalsLabel")} className="mt-3 flex flex-wrap gap-2">
      {totals.map((o) => (
        <li key={o.name} className="rounded-full border border-border bg-card px-3 py-1 font-semibold">
          {t("admin.workshops.optionTotal", { name: o.name, count: o.cakes })}
        </li>
      ))}
    </ul>
  );
}

export function RegistrationList({ registrations, cancelled }: { registrations: RegistrationView[]; cancelled: boolean }) {
  const { t } = useI18n();
  if (registrations.length === 0) return <p className="mt-3">{t("admin.workshops.noRegistrations")}</p>;
  return (
    <ul className="mt-3 grid gap-3">
      {registrations.map((r) => (
        <li key={r.orderId} className={`grid gap-2 rounded-card border border-border bg-card p-3 ${r.active ? "" : "opacity-80"}`}>
          <Link to={`/admin/orders/${r.orderId}`} className="flex min-h-11 items-start gap-2 rounded-md hover:bg-accent" aria-label={t("admin.workshops.openRegistration", { number: r.number, name: r.contactName })}>
            <span className="grid min-w-0 flex-1 gap-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-semibold">{r.number}</span>
                <StatusBadge status={r.status} audience="admin" />
                <PaidTag paid={r.paid} />
              </span>
              <span className="font-semibold wrap-anywhere">{r.contactName}</span>
              <span>
                {t("admin.workshops.cakesCount", { count: r.cakes })}: {r.choices.join(", ")} · <span className="tabular-nums">{formatRupees(r.totalRs)}</span>
              </span>
              {r.peopleNames && <span className="wrap-anywhere">{t("admin.workshops.peopleLine", { names: r.peopleNames })}</span>}
            </span>
            <ChevronRight aria-hidden="true" className="mt-1 size-5 shrink-0" />
          </Link>
          <div>
            <AllergyBadge allergies={r.allergies} />
          </div>
          {r.message && <p className="text-sm wrap-anywhere">{t("admin.workshops.messageLine", { text: r.message })}</p>}
          {cancelled && r.whatsappUrl && (
            <a href={r.whatsappUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 self-start font-semibold link">
              <MessageCircle aria-hidden="true" className="size-5" />
              {t("admin.workshops.tellOnWhatsapp", { name: r.contactName })}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
