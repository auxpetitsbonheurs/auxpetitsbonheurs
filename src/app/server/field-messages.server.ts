// Localised field messages for the Owner's Settings and Availability actions (S-056..S-059):
// a parser's short problem codes become sentences in the admin's language.
import { t as translate } from "~/i18n/catalog.server";
import type { Locale } from "~/lib/locale";
import type { Problems } from "~/server/contracts/settings";

/** `about.fr` + `tooLong` -> "About (French): …"; the language comes from the field name. */
export function fieldMessages(problems: Problems, locale: Locale, area: "settings" | "availability" = "settings"): Record<string, string> {
  return Object.fromEntries(
    Object.entries(problems).map(([field, problem]) => {
      const language = /\.(en|fr)$/.exec(field)?.[1];
      let base = field.replace(/\.(en|fr)$/, "");
      const values: Record<string, string> = language ? { language: translate(`admin.settings.language.${language}`, locale) } : {};
      // `deliveryWindows.1.start` -> "Delivery window 2: …" (one message set for every row).
      const row = /^(deliveryWindows|pickupWindows)\.(\d+)\.(.+)$/.exec(base);
      // `whatsappTemplates.ready.fr` -> "Order ready (French): …" (S-202 AC3).
      const template = /^whatsappTemplates\.([a-z_]+)$/.exec(base);
      if (template) {
        values.template = translate(`admin.order.whatsappTemplates.${template[1]}`, locale);
        base = "whatsappTemplate";
      }
      if (row) {
        values.window = translate(`admin.availability.windowName.${row[1]}`, locale, { n: Number(row[2]) + 1 });
        base = `window.${row[3]}`;
      }
      // `used:1109` (S-127 next invoice number): the code and the lowest number allowed.
      const [code = problem, min] = problem.split(":");
      if (min !== undefined) values.min = min;
      return [field, translate(`admin.${area}.errors.${base}.${code}`, locale, values)];
    }),
  );
}
