import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import {
  discountKindEnum,
  optionKindEnum,
  productStatusEnum,
  productTypeEnum,
  promoLinkEnum,
  promoPlacementEnum,
} from "./enums";
import { admin } from "./people";

const tz = { withTimezone: true } as const;

export const product = pgTable(
  "product",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    type: productTypeEnum("type").notNull(),
    category: text("category"),
    nameEn: text("name_en").notNull(),
    nameFr: text("name_fr"),
    descriptionEn: text("description_en"),
    descriptionFr: text("description_fr"),
    basePriceRs: integer("base_price_rs").notNull(),
    allergens: text("allergens").array().notNull().default(sql`'{}'::text[]`),
    noticeDays: smallint("notice_days"),
    /** Minimum units per basket line (e.g. dessert cups by 6); NULL = no minimum. */
    minQuantity: smallint("min_quantity"),
    status: productStatusEnum("status").notNull().default("available"),
    sortOrder: integer("sort_order").notNull().default(0),
    seasonalStartsOn: date("seasonal_starts_on"),
    seasonalEndsOn: date("seasonal_ends_on"),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
  },
  (t) => [
    index("product_menu_idx").on(t.status, t.type, t.sortOrder),
    check("product_price_ck", sql`${t.basePriceRs} >= 0`),
    check("product_notice_ck", sql`${t.noticeDays} is null or ${t.noticeDays} between 0 and 60`),
    check(
      "product_min_quantity_ck",
      sql`${t.minQuantity} is null or ${t.minQuantity} between 1 and 50`,
    ),
    check(
      "product_season_ck",
      sql`(${t.seasonalStartsOn} is null and ${t.seasonalEndsOn} is null)
        or (${t.seasonalStartsOn} is not null and ${t.seasonalEndsOn} >= ${t.seasonalStartsOn})`,
    ),
  ],
).enableRLS();

/** 1-5 ordered photos; the DB caps at 5 via sort_order 0..4 + unique. */
export const productPhoto = pgTable(
  "product_photo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    storagePath: text("storage_path").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    sortOrder: smallint("sort_order").notNull(),
  },
  (t) => [
    unique("product_photo_slot_key").on(t.productId, t.sortOrder),
    check("product_photo_slot_ck", sql`${t.sortOrder} between 0 and 4`),
  ],
).enableRLS();

export const optionGroup = pgTable(
  "option_group",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    nameEn: text("name_en").notNull(),
    nameFr: text("name_fr"),
    kind: optionKindEnum("kind").notNull(),
    required: boolean("required").notNull().default(false),
    textMaxLength: smallint("text_max_length"),
    quantityMin: smallint("quantity_min"),
    quantityMax: smallint("quantity_max"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    index("option_group_product_idx").on(t.productId, t.sortOrder),
    check("option_group_text_ck", sql`${t.textMaxLength} is null or ${t.kind} = 'text'`),
    check(
      "option_group_qty_ck",
      sql`(${t.quantityMin} is null and ${t.quantityMax} is null)
        or (${t.kind} = 'quantity' and ${t.quantityMin} <= ${t.quantityMax})`,
    ),
  ],
).enableRLS();

export const optionChoice = pgTable(
  "option_choice",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => optionGroup.id, { onDelete: "cascade" }),
    nameEn: text("name_en").notNull(),
    nameFr: text("name_fr"),
    priceDeltaRs: integer("price_delta_rs").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("option_choice_group_idx").on(t.groupId, t.sortOrder)],
).enableRLS();

/** Live = active AND starts_at <= now() < ends_at; computed, never stored (FR-016). */
export const promotion = pgTable(
  "promotion",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    titleEn: text("title_en").notNull(),
    titleFr: text("title_fr"),
    textEn: text("text_en"),
    textFr: text("text_fr"),
    imagePath: text("image_path"),
    startsAt: timestamp("starts_at", tz).notNull(),
    endsAt: timestamp("ends_at", tz).notNull(),
    active: boolean("active").notNull().default(true),
    placement: promoPlacementEnum("placement").notNull(),
    linkKind: promoLinkEnum("link_kind").notNull().default("none"),
    linkProductId: uuid("link_product_id").references(() => product.id, { onDelete: "set null" }),
    linkCategory: text("link_category"),
    createdBy: uuid("created_by").references(() => admin.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
  },
  (t) => [
    index("promotion_window_idx").on(t.startsAt, t.endsAt).where(sql`${t.active}`),
    check("promotion_window_ck", sql`${t.endsAt} > ${t.startsAt}`),
    // Product links may become NULL when the product is deleted (SET NULL); the UI then shows no link.
    check(
      "promotion_link_ck",
      sql`(${t.linkKind} = 'category') = (${t.linkCategory} is not null)
        and (${t.linkKind} = 'product' or ${t.linkProductId} is null)`,
    ),
  ],
).enableRLS();

export const promotionProduct = pgTable(
  "promotion_product",
  {
    promotionId: uuid("promotion_id")
      .notNull()
      .references(() => promotion.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    discountKind: discountKindEnum("discount_kind").notNull(),
    percentOff: smallint("percent_off"),
    salePriceRs: integer("sale_price_rs"),
  },
  (t) => [
    primaryKey({ columns: [t.promotionId, t.productId] }),
    index("promotion_product_product_idx").on(t.productId),
    check(
      "promotion_product_discount_ck",
      sql`(${t.discountKind} = 'percent' and ${t.percentOff} between 1 and 99 and ${t.salePriceRs} is null)
        or (${t.discountKind} = 'sale_price' and ${t.salePriceRs} >= 0 and ${t.percentOff} is null)`,
    ),
  ],
).enableRLS();

export const galleryPhoto = pgTable(
  "gallery_photo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storagePath: text("storage_path").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    occasion: text("occasion"),
    captionEn: text("caption_en"),
    captionFr: text("caption_fr"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (t) => [index("gallery_photo_occasion_idx").on(t.occasion, t.sortOrder)],
).enableRLS();
