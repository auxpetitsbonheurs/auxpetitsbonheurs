ALTER TABLE "customer" ADD COLUMN "anonymised_at" timestamp with time zone;
--> statement-breakpoint
-- PRV-02 (privacy-2026.md): when a customer's personal data was removed, by the Owner's
-- "Anonymise customer" action or the 5-year retention job. Additive and forward-only. Until now
-- the name "Deleted customer" stood for this (E-09 S-174 AC6); any such row gets the flag.
-- Rollback: a later migration drops the column (isAnonymised then needs the name rule back).
UPDATE "customer" SET "anonymised_at" = "updated_at" WHERE "name" = 'Deleted customer' AND "anonymised_at" IS NULL;
