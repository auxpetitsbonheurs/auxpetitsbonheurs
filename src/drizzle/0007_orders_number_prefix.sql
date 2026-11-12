ALTER TABLE "orders" ADD COLUMN "number_prefix" text;
--> statement-breakpoint
-- S-058 AC6: an order keeps the number prefix it was placed with. Existing orders take the
-- current prefix (what they show today); new rows get the Settings prefix at insert unless
-- the insert names one. Expand-only: the column stays nullable and readers fall back to Settings.
UPDATE "orders" SET "number_prefix" = (SELECT s."order_number_prefix" FROM "settings" s WHERE s."id" = 1) WHERE "number_prefix" IS NULL;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION orders_number_prefix_fill() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.number_prefix IS NULL THEN
    SELECT s.order_number_prefix INTO NEW.number_prefix FROM settings s WHERE s.id = 1;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "orders_number_prefix" BEFORE INSERT ON "orders" FOR EACH ROW EXECUTE FUNCTION orders_number_prefix_fill();
