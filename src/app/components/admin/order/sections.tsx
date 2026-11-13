import { MapPin, Phone } from "lucide-react";
import type { ReactNode } from "react";
import { localized } from "~/i18n/localized";
import { useI18n } from "~/i18n/react";
import { formatRupees } from "~/lib/locale";
import type { OrderLoaderData } from "~/routes/admin/order";
import { WhatsappMenu } from "./whatsapp-menu";

const row = "flex flex-wrap justify-between gap-x-4";
const money = (amount: number) => <span className="whitespace-nowrap tabular-nums">{formatRupees(amount)}</span>;
const contactClass = "inline-flex min-h-11 items-center gap-2 rounded-md border-2 border-input bg-card px-4 font-semibold hover:bg-accent";

export function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="font-semibold">{term}</dt>
      <dd className="min-w-0 wrap-anywhere">{children}</dd>
    </div>
  );
}

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-8">
      <h2 id={id} className="text-h2">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A contact button; without its data (legacy row) it stays visible, disabled, with the hint (S-113 AC3). */
function ContactLink({ href, icon, label, hintId }: { href: string | null; icon: ReactNode; label: string; hintId: string }) {
  if (!href) {
    return (
      <span role="link" aria-disabled="true" aria-describedby={hintId} className={`${contactClass} cursor-not-allowed opacity-60`}>
        {icon}
        {label}
      </span>
    );
  }
  return (
    <a href={href} className={contactClass} rel="noreferrer">
      {icon}
      {label}
    </a>
  );
}

/** Name, phone, email and the one-tap Call, WhatsApp and Maps buttons (S-113 AC1-AC4, AC9). */
export function CustomerSection({ data: { customer, telUrl, whatsapp, mapsUrl, order } }: { data: OrderLoaderData }) {
  const { t } = useI18n();
  const name = customer.name;
  return (
    <Section id="customer-heading" title={t("admin.order.customerTitle")}>
      <dl className="mt-3 grid gap-3">
        <Fact term={t("admin.orders.customer")}>{name}</Fact>
        <Fact term={t("admin.order.phone")}>{customer.phone || "—"}</Fact>
        {customer.email && <Fact term={t("admin.order.email")}>{customer.email}</Fact>}
        <Fact term={t("admin.order.languageTerm")}>{t(`admin.order.language.${order.locale}`)}</Fact>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <ContactLink href={telUrl} hintId="no-phone-hint" icon={<Phone aria-hidden="true" className="size-5" />} label={t("admin.order.callName", { name })} />
        <WhatsappMenu items={whatsapp.templates} name={name} orderId={order.id} hintId="no-phone-hint" />
        {mapsUrl && <ContactLink href={mapsUrl} hintId="" icon={<MapPin aria-hidden="true" className="size-5" />} label={t("admin.order.mapsName", { name })} />}
      </div>
      {(!telUrl || !whatsapp.templates) && (
        <p id="no-phone-hint" className="mt-2 text-sm">
          {t("admin.order.noPhone")}
        </p>
      )}
    </Section>
  );
}

export function FulfilmentSection({ data: { order } }: { data: OrderLoaderData }) {
  const { t, locale } = useI18n();
  const windowText = t("checkout.windowLabel", { label: localized(order.window.label, locale), start: order.window.start, end: order.window.end });
  return (
    <Section id="fulfilment-heading" title={t("admin.order.fulfilmentTitle")}>
      <dl className="mt-3 grid gap-3">
        <Fact term={t("admin.order.fulfilmentTitle")}>{order.fulfilment === "delivery" ? t("admin.order.delivery") : t("admin.order.pickup")}</Fact>
        <Fact term={t("admin.order.date")}>{order.dateLabel}</Fact>
        <Fact term={t("admin.order.time")}>{windowText}</Fact>
        {order.address && <Fact term={t("admin.order.address")}>{order.address}</Fact>}
        {order.landmark && <Fact term={t("admin.order.landmark")}>{order.landmark}</Fact>}
      </dl>
    </Section>
  );
}

export function ItemsSection({ data: { order } }: { data: OrderLoaderData }) {
  const { t, locale } = useI18n();
  return (
    <Section id="items-heading" title={t("admin.order.itemsTitle")}>
      <div className="mt-3 grid gap-2 rounded-lg bg-muted p-5">
        <ul className="grid gap-2">
          {order.items.map((item, index) => (
            <li key={index}>
              <p className={row}>
                <span>{t("checkout.itemLine", { name: localized(item.name, locale), quantity: item.quantity })}</span>
                {money(item.lineTotalRs)}
              </p>
              <p className="text-sm">{t("admin.order.unitPrice", { price: formatRupees(item.unitPriceRs) })}</p>
              {item.options.length > 0 && <p className="text-sm">{item.options.map((o) => localized(o.label, locale)).join(", ")}</p>}
              {item.cakeMessage && <p className="text-sm">{t("admin.order.cakeMessage", { message: item.cakeMessage })}</p>}
            </li>
          ))}
        </ul>
        {order.fulfilment === "delivery" ? (
          <p className={row}>
            <span>{t("checkout.feeLine")}</span>
            {money(order.deliveryFeeRs)}
          </p>
        ) : (
          <p>{t("checkout.pickupFree")}</p>
        )}
        <p className={`${row} border-t border-input pt-2 text-lg font-semibold`}>
          <span>{t("checkout.total")}</span>
          {money(order.totalRs)}
        </p>
        {order.totalOverridden && <p className="font-semibold">{t("admin.order.totalByHand")}</p>}
      </div>
      {order.customerNote && (
        <div className="mt-4">
          <h3 className="text-lg">{t("admin.order.customerNote")}</h3>
          <p className="mt-1 max-w-measure whitespace-pre-line wrap-anywhere">{order.customerNote}</p>
        </div>
      )}
    </Section>
  );
}

/** The custom-request fields (S-113 AC8); reference photos arrive with E-08's uploads (S-114 AC4). */
export function RequestSection({ data: { order } }: { data: OrderLoaderData }) {
  const { t } = useI18n();
  const request = order.customRequest;
  if (!request) return null;
  const facts: [string, ReactNode][] = [
    ["occasion", request.occasion],
    ["servings", request.servings],
    ["flavours", request.flavours],
    ["theme", request.theme],
    ["cakeText", request.cakeText],
    ["budget", request.budgetRs === null ? null : formatRupees(request.budgetRs)],
    ["details", request.details],
  ];
  return (
    <Section id="request-heading" title={t("admin.order.requestTitle")}>
      <dl className="mt-3 grid gap-3">
        {facts.map(([key, value]) =>
          value === null || value === "" ? null : (
            <Fact key={key} term={t(`admin.order.request.${key}`)}>
              <span className="whitespace-pre-line">{value}</span>
            </Fact>
          ),
        )}
        {request.quoteAmountRs !== null && (
          <Fact term={t("admin.order.request.quote")}>
            {t("admin.order.request.quoteLine", { amount: formatRupees(request.quoteAmountRs), date: order.quoteExpiresLabel ?? "" })}
            {request.quoteNote && <span className="block whitespace-pre-line">{request.quoteNote}</span>}
          </Fact>
        )}
      </dl>
    </Section>
  );
}

/** Why the order was declined or cancelled, when a reason was given (S-113 AC1). */
export function ReasonSection({ data: { order } }: { data: OrderLoaderData }) {
  const { t } = useI18n();
  if (!order.reason) return null;
  const title = order.status === "declined" ? t("admin.order.reasonDeclined") : t("admin.order.reasonCancelled");
  return (
    <Section id="reason-heading" title={title}>
      <p className="mt-3 max-w-measure whitespace-pre-line wrap-anywhere">{order.reason}</p>
    </Section>
  );
}

