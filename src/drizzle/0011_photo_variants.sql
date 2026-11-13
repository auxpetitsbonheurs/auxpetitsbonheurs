-- Responsive photo sizes (S-276). Additive and forward-only: each photo row (product, gallery,
-- brand page) and the Settings hero and About images get the widths of the smaller copies
-- stored beside the original (`<stem>-480w.<ext>`, `<stem>-960w.<ext>`). Empty (the default)
-- means the original only, so every existing row keeps rendering as before until the
-- staging-only backfill or a new upload fills it. Rollback: a later migration drops the
-- columns; the variant objects are then unused (removals already include them).
ALTER TABLE "gallery_photo" ADD COLUMN "variant_widths" smallint[] DEFAULT '{}'::smallint[] NOT NULL;--> statement-breakpoint
ALTER TABLE "product_photo" ADD COLUMN "variant_widths" smallint[] DEFAULT '{}'::smallint[] NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "hero_image_variants" smallint[] DEFAULT '{}'::smallint[] NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "about_image_variants" smallint[] DEFAULT '{}'::smallint[] NOT NULL;--> statement-breakpoint
ALTER TABLE "site_page_photo" ADD COLUMN "variant_widths" smallint[] DEFAULT '{}'::smallint[] NOT NULL;