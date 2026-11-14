// WhatsApp templates and wa.me links (notifications spec "WhatsApp templates", FR-073). Pure and
// dependency-light so the server, the admin preview and the customer pages share ONE builder:
// every wa.me link in the app comes from `waMeUrl` (Juice proof, contact buttons, the admin menu).
// Nothing is sent by the app: the link opens a chat with an editable, prefilled message.
import type { LocalizedText, WhatsappTemplateKey, WhatsappTemplates } from "~/db/tables/json-types";
import type { Locale } from "~/lib/locale";
import { normalizePhone, whatsappDigits } from "./phone";

export const WHATSAPP_TEMPLATE_KEYS: readonly WhatsappTemplateKey[] = ["approved", "ready", "on_the_way", "payment_instructions", "payment_reminder", "blank"];

/**
 * The placeholder allow-list (S-202 AC3); anything else in braces is refused when saving.
 * `juice_name` and `deadline` (the pay-by time, 24 h after approval) came with approve-then-pay.
 */
export const WHATSAPP_PLACEHOLDERS = ["name", "order_number", "date", "window", "total", "juice_name", "juice_number", "deadline", "pickup_address", "tracking_link"] as const;
export type WhatsappPlaceholder = (typeof WHATSAPP_PLACEHOLDERS)[number];
export type WhatsappValues = Partial<Record<WhatsappPlaceholder, string | null>>;

/** A template text is at most this long (a chat message, not a letter). */
export const WHATSAPP_TEMPLATE_MAX = 1000;

/** Defaults until the Owner edits them in Settings (S-202 AC1); Owner-reviewed before launch. */
export const DEFAULT_WHATSAPP_TEMPLATES: WhatsappTemplates = {
  approved: {
    en: "Hello {name}, your order {order_number} for {date} ({window}) is confirmed. Thank you! You can follow it here: {tracking_link}",
    fr: "Bonjour {name}, votre commande {order_number} du {date} ({window}) est confirmée. Merci ! Vous pouvez la suivre ici : {tracking_link}",
  },
  ready: {
    en: "Hello {name}, good news: your order {order_number} is ready! {pickup_address}",
    fr: "Bonjour {name}, bonne nouvelle : votre commande {order_number} est prête ! {pickup_address}",
  },
  on_the_way: {
    en: "Hello {name}, your order {order_number} is on its way ({window}). See you soon!",
    fr: "Bonjour {name}, votre commande {order_number} est en route ({window}). À tout de suite !",
  },
  // Approve, then pay (2026-11-14): the admin's one tap right after approving.
  payment_instructions: {
    en: "Hello {name}, your order {order_number} for {date} is approved! To confirm it, please send {total} by Juice to {juice_name} ({juice_number}) with the reference {order_number}, by {deadline}. Then reply here with your payment screenshot. Thank you!",
    fr: "Bonjour {name}, votre commande {order_number} du {date} est validée ! Pour la confirmer, merci d'envoyer {total} par Juice à {juice_name} ({juice_number}) avec la référence {order_number}, avant le {deadline}. Puis répondez ici avec la capture de votre paiement. Merci !",
  },
  payment_reminder: {
    en: "Hello {name}, a reminder for order {order_number}: please send {total} by Juice to {juice_number}, then reply here with your payment proof. Thank you!",
    fr: "Bonjour {name}, un rappel pour la commande {order_number} : merci d'envoyer {total} par Juice au {juice_number}, puis de répondre ici avec la preuve de paiement. Merci !",
  },
  blank: {
    en: "Hello {name}, about your order {order_number}: ",
    fr: "Bonjour {name}, au sujet de votre commande {order_number} : ",
  },
};

const PLACEHOLDER = /\{([^{}\s]*)\}/g;
const KNOWN = new Set<string>(WHATSAPP_PLACEHOLDERS);

/** Placeholders in `text` that are not on the allow-list, in order, once each. */
export function unknownPlaceholders(text: string): string[] {
  const found = [...text.matchAll(PLACEHOLDER)].map((match) => match[1]!).filter((name) => !KNOWN.has(name));
  return [...new Set(found)];
}

/** The text for `key` in `locale`: the Owner's, else the default; an empty French text uses English (AC2). */
export function templateText(templates: Partial<WhatsappTemplates> | null | undefined, key: WhatsappTemplateKey, locale: Locale): string {
  const stored: Partial<LocalizedText> | undefined = templates?.[key];
  const fallback = DEFAULT_WHATSAPP_TEMPLATES[key];
  const en = stored?.en?.trim() ? stored.en : fallback.en;
  if (locale === "fr") {
    if (stored) return stored.fr?.trim() ? stored.fr : en;
    return fallback.fr?.trim() ? fallback.fr : en;
  }
  return en;
}

/**
 * Replaces every placeholder (a known one without a value, or any unknown one, becomes empty:
 * no braces remain, AC1, AC4), then collapses the double spaces that leaves and trims each line.
 */
export function fillTemplate(text: string, values: WhatsappValues): string {
  const filled = text.replace(PLACEHOLDER, (_match, name: string) => (KNOWN.has(name) ? (values[name as WhatsappPlaceholder] ?? "") : ""));
  return filled
    .split("\n")
    .map((line) => line.replace(/\(\s*\)/g, "").replace(/[ \t]{2,}/g, " ").replace(/ ([,.:;!?)])/g, (m, p: string) => (p === ":" || p === ";" || p === "!" || p === "?" ? m : p)).trim())
    .join("\n")
    .trim();
}

/** `https://wa.me/<digits>` with an optional prefilled message; `digits` = E.164 without "+". */
export function waMeUrl(digits: string, text?: string): string {
  const base = `https://wa.me/${digits.replace(/\D/g, "")}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

/** The chat link for a phone as people type it, or null when it is not a phone number. */
export function whatsappLinkFor(phone: string | null | undefined, text?: string): string | null {
  const e164 = phone ? normalizePhone(phone) : null;
  return e164 ? waMeUrl(whatsappDigits(e164), text) : null;
}
