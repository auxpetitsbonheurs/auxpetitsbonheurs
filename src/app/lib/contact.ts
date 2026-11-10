/** wa.me wants the international number as digits only. */
export function whatsappHref(number: string): string {
  return `https://wa.me/${number.replace(/\D/g, "")}`;
}

export function telHref(number: string): string {
  return `tel:${number.trim().startsWith("+") ? "+" : ""}${number.replace(/\D/g, "")}`;
}

export function mailHref(email: string): string {
  return `mailto:${email.trim()}`;
}
