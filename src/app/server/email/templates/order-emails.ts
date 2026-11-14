// Every customer email of the outbox (notifications spec "Email catalogue", S-189..S-193).
// Pure: the order, its lines and the shop details come in as plain data (order-data.server.ts
// loads them), the rendered subject, HTML and text come out. The language is the order's
// (`orders.locale`); a missing French string falls back to English per key (catalog.server).
// Only the recipient's own data goes in: never the admin note, never another customer.
import type { OrderItemOption, TimeWindow } from "~/db/tables/json-types";
import { formatLongDate } from "~/domain/time";
import { timeRange } from "~/domain/workshop";
import { t } from "~/i18n/catalog.server";
import { localized } from "~/i18n/localized";
import { type Locale, formatRupees, localePath } from "~/lib/locale";
import { paymentBlock } from "../templates.server";
import { paymentView } from "~/server/payment-view.server";
import { type Block, type Item, type RenderedEmail, renderEmail } from "./layout";

export type OrderEmailKey =
  | "order_received"
  | "request_received"
  | "quote"
  | "order_confirmed"
  | "payment_instructions"
  | "order_updated"
  | "order_declined"
  | "request_declined"
  | "cancellation_confirmed"
  | "quote_closed"
  | "quote_accepted"
  | "ready_for_pickup"
  | "on_the_way"
  | "thank_you"
  | "payment_reminder"
  | "order_cancelled_unpaid"
  | "order_refunded"
  | "workshop_received"
  | "workshop_cancelled"
  | "workshop_changed";

export const ORDER_EMAIL_KEYS: readonly OrderEmailKey[] = [
  "order_received",
  "request_received",
  "quote",
  "order_confirmed",
  "payment_instructions",
  "order_updated",
  "order_declined",
  "request_declined",
  "cancellation_confirmed",
  "quote_closed",
  "quote_accepted",
  "ready_for_pickup",
  "on_the_way",
  "thank_you",
  "payment_reminder",
  "order_cancelled_unpaid",
  "order_refunded",
  "workshop_received",
  "workshop_cancelled",
  "workshop_changed",
];

export const isOrderEmailKey = (value: string): value is OrderEmailKey => (ORDER_EMAIL_KEYS as readonly string[]).includes(value);

export interface OrderEmailData {
  siteUrl: string;
  locale: Locale;
  order: {
    /** "APB-0042" */
    number: string;
    contactName: string;
    status: string;
    fulfilment: "pickup" | "delivery";
    address: string | null;
    landmark: string | null;
    /** Mauritius calendar date, `YYYY-MM-DD`. */
    fulfilOn: string;
    window: TimeWindow;
    deliveryFeeRs: number;
    totalRs: number;
    paid: boolean;
    refundDueRs: number | null;
    declineReason: string | null;
    trackingToken: string;
    createdAt: Date;
  };
  items: { nameEn: string; nameFr: string | null; quantity: number; lineTotalRs: number; options: OrderItemOption[]; cakeMessage: string | null }[];
  request: {
    occasion: string | null;
    servings: number | null;
    theme: string | null;
    photoCount: number;
    quoteAmountRs: number | null;
    quoteNote: string | null;
    quoteExpiresOn: string | null;
  } | null;
  shop: {
    pickupAddress: string | null;
    pickupMapUrl: string | null;
    juiceName: string | null;
    juiceNumber: string | null;
    paymentWhatsapp: string | null;
    instagramUrl: string | null;
  };
  /**
   * The event of a workshop registration (E-15), else null: emails then name the workshop, its
   * date, times and address instead of a pickup. Allergies are the registrant's own data: their
   * own emails may repeat them (S-307); admin alerts never load this.
   */
  workshop?: { title: string; address: string; mapUrl: string | null; cakes: number; peopleNames: string | null; allergies: string | null } | null;
  /** What the queueing statement stored next to the order id (workshop_changed: the previous values of what changed). */
  payload: { reason?: string; why?: string; previousDate?: string; previousTotalRs?: number; previousStart?: string; previousEnd?: string; previousAddress?: string };
}

const origin = (siteUrl: string) => new URL(siteUrl).origin;
const sitePath = (data: OrderEmailData, path: string) => `${origin(data.siteUrl)}${localePath(data.locale, path)}`;
const trackUrl = (data: OrderEmailData) => sitePath(data, `/t/${data.order.trackingToken}`);
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

function optionLine(option: OrderItemOption, locale: Locale): string {
  const group = localized(option.group, locale);
  if (option.kind === "text") return `${group}: ${option.text ?? ""}`;
  const choice = option.choice ? localized(option.choice, locale) : "";
  return option.kind === "quantity" || (option.quantity ?? 1) > 1 ? `${group}: ${choice} × ${option.quantity ?? 1}` : `${group}: ${choice}`;
}

function windowLabel(data: OrderEmailData): string {
  return localized(data.order.window.label, data.locale);
}

function itemBlocks(data: OrderEmailData): Block[] {
  const { locale } = data;
  const items: Item[] = data.items.map((line) => ({
    title: t("email.common.qty", locale, { quantity: line.quantity, name: locale === "fr" && line.nameFr ? line.nameFr : line.nameEn }),
    details: [...line.options.map((option) => optionLine(option, locale)), ...(line.cakeMessage ? [t("email.common.message", locale, { text: line.cakeMessage })] : [])],
    price: formatRupees(line.lineTotalRs),
  }));
  const blocks: Block[] = [
    { kind: "h2", text: t("email.common.itemsHeading", locale) },
    { kind: "items", items, totalLabel: t("email.common.total", locale), total: formatRupees(data.order.totalRs) },
  ];
  if (data.order.fulfilment === "delivery" && data.order.deliveryFeeRs > 0) {
    blocks.push({ kind: "p", text: t("email.common.deliveryFee", locale, { amount: formatRupees(data.order.deliveryFeeRs) }) });
  }
  return blocks;
}

/** Number, date, time, pickup or delivery place: the facts every order email repeats. */
function whenWhere(data: OrderEmailData, only: ("date" | "time" | "where")[] = ["date", "time", "where"]): Block {
  const { locale, order, shop } = data;
  const rows: { label: string; value: string }[] = [];
  if (only.includes("date")) rows.push({ label: t("email.common.date", locale), value: formatLongDate(order.fulfilOn, locale) });
  if (only.includes("time")) rows.push({ label: t("email.common.time", locale), value: windowLabel(data) });
  if (only.includes("where")) {
    if (data.workshop) {
      rows.push({ label: t("email.workshop.where", locale), value: data.workshop.address });
    } else if (order.fulfilment === "pickup") {
      rows.push({ label: t("email.common.pickupAddress", locale), value: shop.pickupAddress ?? t("email.common.pickup", locale) });
    } else {
      rows.push({ label: t("email.common.deliveryAddress", locale), value: [order.address, order.landmark].filter(Boolean).join(", ") });
    }
  }
  return { kind: "facts", rows };
}

const trackBlock = (data: OrderEmailData): Block => ({ kind: "button", label: t("email.common.track", data.locale), href: trackUrl(data) });
const trackLink = (data: OrderEmailData): Block => ({ kind: "link", label: t("email.common.trackText", data.locale), href: trackUrl(data) });
const hello = (data: OrderEmailData): Block => ({ kind: "p", text: t("email.common.hello", data.locale, { name: firstName(data.order.contactName) }) });

function paymentBlocks(data: OrderEmailData): Block[] {
  const { order, shop, locale } = data;
  const view = paymentView({
    totalRs: order.totalRs,
    reference: order.number,
    createdAt: order.createdAt,
    settings: { juiceName: shop.juiceName, juiceNumber: shop.juiceNumber, paymentWhatsapp: shop.paymentWhatsapp },
    locale,
  });
  const block = paymentBlock(locale, view);
  return [{ kind: "raw", html: block.html, text: block.text }];
}

function vars(data: OrderEmailData) {
  return { number: data.order.number };
}

/** "Valentine's cake workshop: 2 cakes" and, when given, the people and allergies (the registrant's own email only). */
function workshopBlocks(data: OrderEmailData): Block[] {
  const { locale, workshop } = data;
  if (!workshop) return [];
  const rows = [
    { label: t("email.workshop.event", locale), value: workshop.title },
    { label: t("email.workshop.cakes", locale), value: t("email.workshop.cakesValue", locale, { count: workshop.cakes }) },
    ...(workshop.peopleNames ? [{ label: t("email.workshop.people", locale), value: workshop.peopleNames }] : []),
    { label: t("email.workshop.allergies", locale), value: workshop.allergies ?? t("email.workshop.allergiesNone", locale) },
  ];
  return [{ kind: "facts", rows }];
}

const mapLink = (data: OrderEmailData): Block[] => (data.workshop?.mapUrl ? [{ kind: "link", label: t("email.common.map", data.locale), href: data.workshop.mapUrl }] : []);

/** The workshop wording of a shared email: `email.workshop.<key>.<part>` when the order is a registration. */
const wk = (data: OrderEmailData, key: string, part: string) => (data.workshop ? `email.workshop.${key}.${part}` : null);

/** Date, time and place of a changed workshop: each changed one says "New …" with its previous value. */
function changedRows(data: OrderEmailData): { label: string; value: string }[] {
  const { locale, order, payload } = data;
  const was = (value: string) => t("email.orderUpdated.was", locale, { value });
  const start = order.window.start;
  const end = order.window.end;
  const now = { date: formatLongDate(order.fulfilOn, locale), time: timeRange(start, end, locale), place: data.workshop?.address ?? "" };
  const timeChanged = payload.previousStart !== undefined || payload.previousEnd !== undefined;
  return [
    payload.previousDate !== undefined
      ? { label: t("email.orderUpdated.newDate", locale), value: `${now.date} (${was(formatLongDate(payload.previousDate, locale))})` }
      : { label: t("email.common.date", locale), value: now.date },
    timeChanged
      ? { label: t("email.workshop.changed.newTime", locale), value: `${now.time} (${was(timeRange(payload.previousStart ?? start, payload.previousEnd ?? end, locale))})` }
      : { label: t("email.common.time", locale), value: now.time },
    payload.previousAddress !== undefined
      ? { label: t("email.workshop.changed.newPlace", locale), value: `${now.place} (${was(payload.previousAddress)})` }
      : { label: t("email.workshop.where", locale), value: now.place },
  ];
}

type Builder = (data: OrderEmailData) => { subject: string; heading: string; blocks: Block[] };

const BUILDERS: Record<OrderEmailKey, Builder> = {
  order_received(data) {
    const { locale } = data;
    return {
      subject: t("email.orderReceived.subject", locale, vars(data)),
      heading: t("email.orderReceived.heading", locale),
      blocks: [
        hello(data),
        { kind: "note", text: t("email.orderReceived.intro", locale, vars(data)) },
        ...itemBlocks(data),
        whenWhere(data),
        ...(data.order.status === "awaiting_payment" ? paymentBlocks(data) : []),
        trackBlock(data),
        { kind: "p", text: t("email.common.policy", locale) },
      ],
    };
  },
  // Approve, then pay (2026-11-14): the bakery approved the order; how to pay by Juice, the
  // deadline (24 h after the approval) and the proof button. Order confirmed follows the payment.
  payment_instructions(data) {
    const { locale } = data;
    return {
      subject: t(wk(data, "accepted", "subject") ?? "email.paymentInstructions.subject", locale, vars(data)),
      heading: t(wk(data, "accepted", "heading") ?? "email.paymentInstructions.heading", locale),
      blocks: [
        hello(data),
        { kind: "note", text: t(wk(data, "accepted", "intro") ?? "email.paymentInstructions.intro", locale, { ...vars(data), amount: formatRupees(data.order.totalRs) }) },
        ...paymentBlocks(data),
        ...workshopBlocks(data),
        ...itemBlocks(data),
        whenWhere(data),
        trackBlock(data),
        { kind: "p", text: t("email.common.policy", locale) },
      ],
    };
  },
  // E-08 S-158: the quote was accepted; it is confirmed once paid by Juice (same flow as an order).
  quote_accepted(data) {
    const { locale } = data;
    return {
      subject: t("email.quoteAccepted.subject", locale, vars(data)),
      heading: t("email.quoteAccepted.heading", locale),
      blocks: [
        hello(data),
        { kind: "note", text: t("email.quoteAccepted.intro", locale, vars(data)) },
        whenWhere(data),
        ...(data.order.status === "awaiting_payment" ? paymentBlocks(data) : []),
        trackBlock(data),
        { kind: "p", text: t("email.common.policy", locale) },
      ],
    };
  },
  request_received(data) {
    const { locale, request } = data;
    const rows = [
      request?.occasion ? { label: t("email.requestReceived.occasion", locale), value: request.occasion } : null,
      request?.servings ? { label: t("email.requestReceived.servings", locale), value: String(request.servings) } : null,
      request?.theme ? { label: t("email.requestReceived.theme", locale), value: request.theme } : null,
      request ? { label: t("email.common.date", locale), value: formatLongDate(data.order.fulfilOn, locale) } : null,
      request && request.photoCount > 0 ? { label: t("email.requestReceived.photosLabel", locale), value: t("email.requestReceived.photos", locale, { count: request.photoCount }) } : null,
    ].filter((row): row is { label: string; value: string } => row !== null);
    return {
      subject: t("email.requestReceived.subject", locale, vars(data)),
      heading: t("email.requestReceived.heading", locale),
      blocks: [hello(data), { kind: "note", text: t("email.requestReceived.intro", locale, vars(data)) }, { kind: "facts", rows }, trackBlock(data)],
    };
  },
  quote(data) {
    const { locale, request } = data;
    const amount = formatRupees(request?.quoteAmountRs ?? data.order.totalRs);
    const rows = [
      { label: t("email.quote.amount", locale), value: amount },
      ...(request?.quoteExpiresOn ? [{ label: t("email.quote.valid", locale), value: formatLongDate(request.quoteExpiresOn, locale) }] : []),
    ];
    return {
      subject: t("email.quote.subject", locale, { ...vars(data), amount }),
      heading: t("email.quote.heading", locale),
      blocks: [
        hello(data),
        { kind: "p", text: t("email.quote.intro", locale, vars(data)) },
        { kind: "facts", rows },
        ...(request?.quoteNote ? [{ kind: "p" as const, text: `${t("email.quote.note", locale)}: ${request.quoteNote}` }] : []),
        { kind: "p", text: t("email.quote.decide", locale) },
        { kind: "button", label: t("email.quote.accept", locale), href: trackUrl(data) },
        { kind: "button", label: t("email.quote.decline", locale), href: trackUrl(data) },
      ],
    };
  },
  order_confirmed(data) {
    const { locale, order } = data;
    const payment = order.paid ? t("email.orderConfirmed.paid", locale) : t("email.orderConfirmed.cash", locale);
    return {
      subject: t(wk(data, "confirmed", "subject") ?? "email.orderConfirmed.subject", locale, vars(data)),
      heading: t(wk(data, "confirmed", "heading") ?? "email.orderConfirmed.heading", locale),
      blocks: [
        hello(data),
        { kind: "note", text: t(wk(data, "confirmed", "intro") ?? "email.orderConfirmed.intro", locale, vars(data)) },
        ...workshopBlocks(data),
        ...itemBlocks(data),
        whenWhere(data),
        ...mapLink(data),
        ...(payment ? [{ kind: "p" as const, text: payment }] : []),
        trackBlock(data),
        { kind: "p", text: t("email.common.policy", locale) },
      ],
    };
  },
  order_updated(data) {
    const { locale, order, payload } = data;
    const was = (value: string) => t("email.orderUpdated.was", locale, { value });
    const rows: { label: string; value: string }[] = [];
    const dateChanged = payload.previousDate !== undefined && payload.previousDate !== order.fulfilOn;
    const totalChanged = payload.previousTotalRs !== undefined && payload.previousTotalRs !== order.totalRs;
    rows.push({
      label: dateChanged ? t("email.orderUpdated.newDate", locale) : t("email.common.date", locale),
      value: dateChanged ? `${formatLongDate(order.fulfilOn, locale)} (${was(formatLongDate(payload.previousDate!, locale))})` : formatLongDate(order.fulfilOn, locale),
    });
    rows.push({ label: t("email.common.time", locale), value: windowLabel(data) });
    rows.push({
      label: totalChanged ? t("email.orderUpdated.newTotal", locale) : t("email.common.total", locale),
      value: totalChanged ? `${formatRupees(order.totalRs)} (${was(formatRupees(payload.previousTotalRs!))})` : formatRupees(order.totalRs),
    });
    return {
      subject: t("email.orderUpdated.subject", locale, vars(data)),
      heading: t("email.orderUpdated.heading", locale),
      blocks: [hello(data), { kind: "note", text: t("email.orderUpdated.intro", locale, vars(data)) }, { kind: "facts", rows }, trackBlock(data)],
    };
  },
  order_declined(data) {
    const { locale, order, payload } = data;
    const reason = payload.reason ?? order.declineReason;
    return {
      subject: t("email.orderDeclined.subject", locale, vars(data)),
      heading: t("email.orderDeclined.heading", locale),
      blocks: [
        hello(data),
        { kind: "p", text: t(wk(data, "declined", "intro") ?? "email.orderDeclined.intro", locale, vars(data)) },
        ...(reason ? [{ kind: "note" as const, text: `${t("email.common.reason", locale)}: ${reason}` }] : []),
        ...(order.paid ? [{ kind: "p" as const, text: t("email.orderDeclined.refund", locale, { amount: formatRupees(order.refundDueRs ?? order.totalRs) }) }] : []),
        { kind: "button", label: t("email.common.menu", locale), href: sitePath(data, "/") },
      ],
    };
  },
  request_declined(data) {
    const { locale, order, payload } = data;
    const reason = payload.reason ?? order.declineReason;
    return {
      subject: t("email.requestDeclined.subject", locale, vars(data)),
      heading: t("email.requestDeclined.heading", locale),
      blocks: [
        hello(data),
        { kind: "p", text: t("email.requestDeclined.intro", locale, vars(data)) },
        ...(reason ? [{ kind: "note" as const, text: `${t("email.common.reason", locale)}: ${reason}` }] : []),
        { kind: "button", label: t("email.common.menu", locale), href: sitePath(data, "/") },
      ],
    };
  },
  cancellation_confirmed(data) {
    const { locale, order } = data;
    const due = order.paid ? (order.refundDueRs ?? order.totalRs) : 0;
    return {
      subject: t("email.cancellation.subject", locale, vars(data)),
      heading: t("email.cancellation.heading", locale),
      blocks: [
        hello(data),
        { kind: "p", text: t("email.cancellation.intro", locale, vars(data)) },
        ...(due > 0 ? [{ kind: "note" as const, text: t("email.cancellation.refund", locale, { amount: formatRupees(due) }) }] : []),
        { kind: "button", label: t("email.common.menu", locale), href: sitePath(data, "/") },
      ],
    };
  },
  quote_closed(data) {
    const { locale, payload } = data;
    return {
      subject: t("email.quoteClosed.subject", locale, vars(data)),
      heading: t("email.quoteClosed.heading", locale),
      blocks: [
        hello(data),
        { kind: "p", text: t(payload.why === "expired" ? "email.quoteClosed.expired" : "email.quoteClosed.declined", locale, vars(data)) },
        { kind: "p", text: t("email.quoteClosed.again", locale) },
        { kind: "button", label: t("email.common.customCake", locale), href: sitePath(data, "/custom-cake") },
      ],
    };
  },
  ready_for_pickup(data) {
    const { locale, shop } = data;
    return {
      subject: t("email.ready.subject", locale, vars(data)),
      heading: t("email.ready.heading", locale),
      blocks: [
        hello(data),
        { kind: "note", text: t("email.ready.intro", locale, vars(data)) },
        whenWhere(data),
        ...(shop.pickupMapUrl ? [{ kind: "link" as const, label: t("email.common.map", locale), href: shop.pickupMapUrl }] : []),
        trackLink(data),
      ],
    };
  },
  on_the_way(data) {
    const { locale } = data;
    return {
      subject: t("email.onTheWay.subject", locale, vars(data)),
      heading: t("email.onTheWay.heading", locale),
      blocks: [hello(data), { kind: "note", text: t("email.onTheWay.intro", locale, vars(data)) }, whenWhere(data), trackLink(data)],
    };
  },
  thank_you(data) {
    const { locale, shop } = data;
    return {
      subject: t("email.thanks.subject", locale, vars(data)),
      heading: t("email.thanks.heading", locale),
      blocks: [
        hello(data),
        { kind: "p", text: t("email.thanks.intro", locale, vars(data)) },
        { kind: "p", text: t("email.thanks.again", locale) },
        { kind: "button", label: t("email.common.orderAgain", locale), href: sitePath(data, "/") },
        ...(shop.instagramUrl ? [{ kind: "link" as const, label: t("email.common.instagram", locale), href: shop.instagramUrl }] : []),
      ],
    };
  },
  payment_reminder(data) {
    const { locale } = data;
    return {
      subject: t("email.paymentReminder.subject", locale, vars(data)),
      heading: t("email.paymentReminder.heading", locale),
      blocks: [hello(data), { kind: "note", text: t(wk(data, "reminder", "intro") ?? "email.paymentReminder.intro", locale, vars(data)) }, ...paymentBlocks(data), trackBlock(data)],
    };
  },
  order_cancelled_unpaid(data) {
    const { locale } = data;
    return {
      subject: t("email.cancelledUnpaid.subject", locale, vars(data)),
      heading: t("email.cancelledUnpaid.heading", locale),
      blocks: [
        hello(data),
        { kind: "p", text: t(wk(data, "unpaid", "intro") ?? "email.cancelledUnpaid.intro", locale, vars(data)) },
        { kind: "p", text: t(wk(data, "unpaid", "again") ?? "email.cancelledUnpaid.again", locale) },
        data.workshop
          ? { kind: "button", label: t("email.workshop.seeWorkshops", locale), href: sitePath(data, "/workshops") }
          : { kind: "button", label: t("email.common.menu", locale), href: sitePath(data, "/") },
      ],
    };
  },
  order_refunded(data) {
    const { locale, order } = data;
    return {
      subject: t("email.refunded.subject", locale, vars(data)),
      heading: t("email.refunded.heading", locale),
      blocks: [
        hello(data),
        { kind: "note", text: t("email.refunded.intro", locale, { ...vars(data), amount: formatRupees(order.refundDueRs ?? order.totalRs) }) },
        { kind: "button", label: t("email.common.menu", locale), href: sitePath(data, "/") },
      ],
    };
  },
  // E-15 S-307: the registration was received; the bakery answers before any payment (approve then pay).
  workshop_received(data) {
    const { locale } = data;
    return {
      subject: t("email.workshop.received.subject", locale, vars(data)),
      heading: t("email.workshop.received.heading", locale),
      blocks: [
        hello(data),
        { kind: "note", text: t("email.workshop.received.intro", locale, vars(data)) },
        ...workshopBlocks(data),
        ...itemBlocks(data),
        whenWhere(data),
        ...mapLink(data),
        trackBlock(data),
      ],
    };
  },
  // The event was cancelled by the bakery: the reason, and the refund when it was paid.
  workshop_cancelled(data) {
    const { locale, order, payload } = data;
    const due = order.paid ? (order.refundDueRs ?? order.totalRs) : 0;
    const title = data.workshop?.title ?? "";
    return {
      subject: t("email.workshop.cancelled.subject", locale, { ...vars(data), title }),
      heading: t("email.workshop.cancelled.heading", locale),
      blocks: [
        hello(data),
        { kind: "p", text: t("email.workshop.cancelled.intro", locale, { ...vars(data), title }) },
        ...(payload.reason ? [{ kind: "note" as const, text: `${t("email.common.reason", locale)}: ${payload.reason}` }] : []),
        ...(due > 0 ? [{ kind: "note" as const, text: t("email.cancellation.refund", locale, { amount: formatRupees(due) }) }] : []),
        { kind: "button", label: t("email.workshop.seeWorkshops", locale), href: sitePath(data, "/workshops") },
      ],
    };
  },
  // E-15 tidy: the bakery moved the event's date or time, or its address: what changed, then the new details.
  workshop_changed(data) {
    const { locale } = data;
    const title = data.workshop?.title ?? "";
    return {
      subject: t("email.workshop.changed.subject", locale, { ...vars(data), title }),
      heading: t("email.workshop.changed.heading", locale),
      blocks: [
        hello(data),
        { kind: "note", text: t("email.workshop.changed.intro", locale, { ...vars(data), title }) },
        { kind: "facts", rows: changedRows(data) },
        ...mapLink(data),
        { kind: "p", text: t("email.workshop.changed.suits", locale) },
        trackBlock(data),
      ],
    };
  },
};

/** The email for `key`, rendered in the data's locale. */
export function renderOrderEmail(key: OrderEmailKey, data: OrderEmailData): RenderedEmail {
  const built = BUILDERS[key](data);
  return renderEmail({ locale: data.locale, siteUrl: data.siteUrl, ...built });
}
