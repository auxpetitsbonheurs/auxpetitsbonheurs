import { waMeUrl } from "~/domain/whatsapp";
/** wa.me wants the international number as digits only; `text` pre-fills the chat (S-251, S-252; one builder, domain/whatsapp). */
export function whatsappHref(number: string, text?: string): string {
  return waMeUrl(number, text);
}

export function telHref(number: string): string {
  return `tel:${number.trim().startsWith("+") ? "+" : ""}${number.replace(/\D/g, "")}`;
}

export function mailHref(email: string): string {
  return `mailto:${email.trim()}`;
}

/** An Owner-entered link (map, Instagram) only when it is http or https; anything else is dropped. */
export function safeWebUrl(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}
