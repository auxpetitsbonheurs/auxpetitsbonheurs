import { sql } from "drizzle-orm";
import { boolean, check, integer, jsonb, pgTable, smallint, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import type { PageContent, PageEvent } from "../../domain/site-pages";
import { admin } from "./people";

const tz = { withTimezone: true } as const;

/**
 * Brand pages the client edits (E-13 S-245, FR-078): one row per page key. `content` holds
 * `{ <field>: { en, fr? } }` for the fields the page has (domain/site-pages.ts), validated at
 * the write boundary. `is_placeholder` stays true until the first save (noindex until then).
 */
export const sitePage = pgTable(
  "site_page",
  {
    key: text("key").primaryKey(),
    content: jsonb("content").$type<PageContent>().notNull().default(sql`'{}'::jsonb`),
    /** Workshops "next workshop" block (S-249), null when none is planned. */
    event: jsonb("event").$type<PageEvent>(),
    isPlaceholder: boolean("is_placeholder").notNull().default(true),
    version: integer("version").notNull().default(1),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
    updatedBy: uuid("updated_by").references(() => admin.id, { onDelete: "set null" }),
  },
  (t) => [check("site_page_key_ck", sql`${t.key} in ('our_story', 'workshops', 'gallery', 'contact', 'custom_order')`)],
).enableRLS();

/**
 * Ordered photos of a page (S-247). `role` = `page` (the page's photos) or `event` (the one
 * photo of the Workshops next-workshop block). The slot check is the per-page limit
 * (our_story 4, workshops 6 + 1 event photo, custom_order 3, others none).
 */
export const sitePagePhoto = pgTable(
  "site_page_photo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageKey: text("page_key")
      .notNull()
      .references(() => sitePage.key, { onDelete: "cascade" }),
    role: text("role").notNull().default("page"),
    storagePath: text("storage_path").notNull().unique(),
    /** Widths of the smaller copies stored beside it (S-276); empty = original only. */
    variantWidths: smallint("variant_widths").array().notNull().default(sql`'{}'::smallint[]`),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    altEn: text("alt_en").notNull(),
    altFr: text("alt_fr"),
    sortOrder: smallint("sort_order").notNull(),
  },
  (t) => [
    unique("site_page_photo_slot_key").on(t.pageKey, t.role, t.sortOrder),
    check("site_page_photo_size_ck", sql`${t.width} > 0 and ${t.height} > 0`),
    check(
      "site_page_photo_slot_ck",
      sql`(${t.role} = 'page' and (
            (${t.pageKey} = 'our_story' and ${t.sortOrder} between 0 and 3)
            or (${t.pageKey} = 'workshops' and ${t.sortOrder} between 0 and 5)
            or (${t.pageKey} = 'custom_order' and ${t.sortOrder} between 0 and 2)))
        or (${t.role} = 'event' and ${t.pageKey} = 'workshops' and ${t.sortOrder} = 0)`,
    ),
  ],
).enableRLS();
