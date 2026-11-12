// Admin Pages save input (contracts.md `admin/page` `save`, S-246, S-247). Flat form names:
// `<field>.en` / `<field>.fr` per page field, photos as `photos.<n>.path|width|height|alt.en|alt.fr`
// in display order, `uploadSessionId` (repeated, at most two), and for Workshops `event.title.en|fr`, `event.date`, `event.seats`,
// `event.text.en|fr`, `eventPhoto.path|width|height|alt.en|alt.fr`. Every field is checked so
// the page can mark all problems at once; problems are short codes (`admin.pages.errors.*`).
import {
  EVENT_SEATS_MAX,
  EVENT_TEXT_MAX,
  EVENT_TITLE_MAX,
  PAGE_PHOTO_LIMITS,
  PHOTO_ALT_MAX,
  type PageContent,
  type PageText,
  SITE_PAGE_FIELDS,
  type SitePageField,
  type SitePageKey,
  fieldMax,
} from "~/domain/site-pages";
import { MuDate, Uuid, Version } from "./shared";

export type Problems = Record<string, string>;

export interface PagePhotoInput {
  path: string;
  width: number;
  height: number;
  alt: PageText;
}

export interface PageEventInput {
  title: PageText;
  date: string;
  seats: number | null;
  text: PageText | null;
  photo: PagePhotoInput | null;
}

export interface SitePageInput {
  content: PageContent;
  photos: PagePhotoInput[];
  event: PageEventInput | null;
}

export type SitePageForm = { ok: true; version: number; uploadSessionIds: string[]; input: SitePageInput } | { ok: false; problems: Problems };

/** More photo rows than this are not read at all (a forged form cannot make the parser loop). */
const PHOTO_ROWS_READ = 12;
const PATH_MAX = 300;
const EDGE_MAX = 10_000;

const text = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
};

/** `{ en, fr? }` or null when both are blank; French without English is refused. */
function pageText(form: FormData, name: string, max: number, problems: Problems): PageText | null {
  const en = text(form, `${name}.en`);
  const fr = text(form, `${name}.fr`);
  if (en.length > max) problems[`${name}.en`] = "tooLong";
  if (fr.length > max) problems[`${name}.fr`] = "tooLong";
  if (en === "" && fr !== "") problems[`${name}.en`] = "missingEn";
  if (en === "" && fr === "") return null;
  return fr === "" ? { en } : { en, fr };
}

function edge(raw: string): number | null {
  if (!/^\d{1,5}$/.test(raw)) return null;
  const value = Number(raw);
  return value >= 1 && value <= EDGE_MAX ? value : null;
}

/** One photo row; null when its path is blank (no photo). An English alt is required (S-247 AC3). */
function photoRow(form: FormData, name: string, problems: Problems): PagePhotoInput | null {
  const path = text(form, `${name}.path`);
  if (path === "") return null;
  const width = edge(text(form, `${name}.width`));
  const height = edge(text(form, `${name}.height`));
  if (path.length > PATH_MAX || path.includes("..") || width === null || height === null) problems[name] = "invalid";
  const alt = pageText(form, `${name}.alt`, PHOTO_ALT_MAX, problems);
  if (!alt && !problems[`${name}.alt.en`]) problems[`${name}.alt.en`] = "required";
  return { path, width: width ?? 1, height: height ?? 1, alt: alt ?? { en: "" } };
}

function photoRows(form: FormData, key: SitePageKey, problems: Problems): PagePhotoInput[] {
  const photos: PagePhotoInput[] = [];
  for (let n = 0; n < PHOTO_ROWS_READ; n += 1) {
    const photo = photoRow(form, `photos.${n}`, problems);
    if (photo) photos.push(photo);
  }
  if (photos.length > PAGE_PHOTO_LIMITS[key]) problems.photos = "tooMany";
  return photos;
}

/** The Workshops next-workshop block: null when every field is blank (none planned). */
function eventBlock(form: FormData, problems: Problems): PageEventInput | null {
  const title = pageText(form, "event.title", EVENT_TITLE_MAX, problems);
  const body = pageText(form, "event.text", EVENT_TEXT_MAX, problems);
  const rawDate = text(form, "event.date");
  const rawSeats = text(form, "event.seats");
  const photo = photoRow(form, "eventPhoto", problems);
  if (!title && !body && rawDate === "" && rawSeats === "" && !photo) return null;
  if (!title && !problems["event.title.en"]) problems["event.title.en"] = "required";
  const date = MuDate.safeParse(rawDate);
  if (!date.success) problems["event.date"] = rawDate === "" ? "required" : "invalid";
  let seats: number | null = null;
  if (rawSeats !== "") {
    seats = /^\d{1,4}$/.test(rawSeats) ? Number(rawSeats) : Number.NaN;
    if (!(seats >= 1 && seats <= EVENT_SEATS_MAX)) problems["event.seats"] = "invalid";
  }
  return { title: title ?? { en: "" }, date: date.success ? date.data : "", seats, text: body, photo };
}

export function parseSitePageForm(form: FormData, key: SitePageKey): SitePageForm {
  const problems: Problems = {};
  const version = Version.safeParse(form.get("version"));
  if (!version.success) problems.version = "invalid";
  // One upload session per photo list on the page (page photos, workshop photo): at most two.
  const sessions = form.getAll("uploadSessionId").map(String).filter((s) => s !== "");
  if (sessions.length > 2 || !sessions.every((s) => Uuid.safeParse(s).success)) problems.uploadSessionId = "invalid";
  const uploadSessionIds = sessions.slice(0, 2).map((s) => s.toLowerCase());
  const content: PageContent = {};
  for (const field of SITE_PAGE_FIELDS[key] as readonly SitePageField[]) {
    const value = pageText(form, field, fieldMax(field), problems);
    if (value) content[field] = value;
  }
  const photos = photoRows(form, key, problems);
  const event = key === "workshops" ? eventBlock(form, problems) : null;
  if (Object.keys(problems).length > 0) return { ok: false, problems };
  return { ok: true, version: version.data!, uploadSessionIds, input: { content, photos, event } };
}
