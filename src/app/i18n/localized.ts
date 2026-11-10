import type { Locale } from "~/lib/locale";

/** A bilingual database field: `*_en`/`*_fr` columns or `{ en, fr }` jsonb. */
export interface LocalizedField {
  en: string;
  fr?: string | null;
}

/** The text for `locale`; French that is missing, empty or whitespace falls back to English. */
export function localized(field: LocalizedField, locale: Locale): string {
  if (locale === "fr" && field.fr && field.fr.trim() !== "") return field.fr;
  return field.en;
}
