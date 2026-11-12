// Localised field messages for the admin Pages editor (E-13 S-246, S-247): the parser's and
// the save's short problem codes become sentences in the admin's language.
import { EVENT_TEXT_MAX, EVENT_TITLE_MAX, PAGE_PHOTO_LIMITS, PHOTO_ALT_MAX, type SitePageField, type SitePageKey, fieldMax } from "~/domain/site-pages";
import { t as translate } from "~/i18n/catalog.server";
import type { Locale } from "~/lib/locale";

type Message = [key: string, values?: Record<string, string | number>];

function photoMessage(n: number, rest: string, problem: string): Message {
  if (rest === "") return ["errors.photoRejected", { n }];
  if (problem === "tooLong") return ["errors.altTooLong", { n, max: PHOTO_ALT_MAX }];
  return ["errors.altRequired", { n }];
}

function eventMessage(field: string, problem: string, language: string, locale: Locale): Message {
  if (field === "event.date") return [problem === "required" ? "errors.eventDateRequired" : "errors.eventDateInvalid"];
  if (field === "event.seats") return ["errors.eventSeats"];
  if (field.startsWith("eventPhoto.alt")) return ["errors.eventPhotoAlt"];
  if (field === "eventPhoto") return ["errors.eventPhotoRejected"];
  const part = field.startsWith("event.title") ? "title" : "text";
  if (problem === "tooLong") return ["errors.tooLong", { field: translate(`admin.pages.event.${part}`, locale), language, max: part === "title" ? EVENT_TITLE_MAX : EVENT_TEXT_MAX }];
  return part === "title" ? ["errors.eventTitleRequired"] : ["errors.missingEn", { field: translate("admin.pages.event.text", locale) }];
}

function messageFor(key: SitePageKey, field: string, problem: string, locale: Locale): Message {
  const languageCode = /\.(en|fr)$/.exec(field)?.[1];
  const language = languageCode ? translate(`admin.settings.language.${languageCode}`, locale) : "";
  const photo = /^photos\.(\d+)(.*)$/.exec(field);
  if (photo) return photoMessage(Number(photo[1]) + 1, photo[2] ?? "", problem);
  if (field === "photos") return problem === "tooMany" ? ["errors.photosTooMany", { max: PAGE_PHOTO_LIMITS[key] }] : ["errors.photosRejected"];
  if (field.startsWith("event")) return eventMessage(field, problem, language, locale);
  const base = field.replace(/\.(en|fr)$/, "") as SitePageField;
  const label = translate(`admin.pages.fields.${base}.label`, locale);
  if (problem === "tooLong") return ["errors.tooLong", { field: label, language, max: fieldMax(base) }];
  if (problem === "missingEn") return ["errors.missingEn", { field: label }];
  return ["errors.invalid"];
}

export function pageFieldMessages(key: SitePageKey, problems: Record<string, string>, locale: Locale): Record<string, string> {
  return Object.fromEntries(
    Object.entries(problems).map(([field, problem]) => {
      const [messageKey, values] = messageFor(key, field, problem, locale);
      return [field, translate(`admin.pages.${messageKey}`, locale, values)];
    }),
  );
}
