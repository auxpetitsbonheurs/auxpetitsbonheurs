-- S-053 AC8: a promotion's optional image gets the same responsive copies as product photos
-- (S-276, 0011): the widths stored beside `image_path` (`<stem>-480w.<ext>`, `<stem>-960w.<ext>`).
-- Additive and forward-only; empty (the default) means the original only. Rollback: a later
-- migration drops the column (the copies are then unused; removals already include them).
ALTER TABLE "promotion" ADD COLUMN "image_variants" smallint[] DEFAULT '{}'::smallint[] NOT NULL;
