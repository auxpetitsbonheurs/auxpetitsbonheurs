export function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m))
}

/** International format; +230 when no country code is given. */
export function normalisePhone(raw: string): string {
  const s = raw.trim().replace(/[\s\-().]/g, '')
  if (s.startsWith('+')) return s
  if (s.startsWith('00')) return `+${s.slice(2)}`
  if (s.startsWith('230') && s.length >= 10) return `+${s}`
  return `+230${s.replace(/^0+/, '')}`
}

export function waLink(phone: string, text: string): string {
  return `https://wa.me/${normalisePhone(phone).replace('+', '')}?text=${encodeURIComponent(text)}`
}
