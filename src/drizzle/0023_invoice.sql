ALTER TABLE "orders" ADD COLUMN "invoice_number" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "invoice_date" date;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "invoice_legal_name" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "invoice_brn" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "invoice_address" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "invoice_phone" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "bank_name" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "bank_account_name" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "bank_account_number" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "invoice_payment_terms" jsonb;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "invoice_thank_you" jsonb;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "next_invoice_number" integer DEFAULT 1108 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_invoice_number_key" UNIQUE("invoice_number");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_invoice_ck" CHECK (("orders"."invoice_number" is null) = ("orders"."invoice_date" is null));--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_next_invoice_ck" CHECK ("settings"."next_invoice_number" between 1 and 99999999);--> statement-breakpoint
-- S-127 (invoice job): invoice details in Settings (Owner-only; the legal name, BRN and address
-- also fill the privacy note), the invoice counter (the client's last paper invoice was 1107), and
-- each order's invoice number and date, taken once. Additive and forward-only. The default terms
-- are the Owner's (full payment by Juice, no deposit) and stay editable; business values start empty.
-- Rollback: a later migration drops the columns and constraints.
UPDATE "settings" SET
  "invoice_payment_terms" = '{"en":"Full payment by Juice before delivery/pickup","fr":"Paiement intégral par Juice avant la livraison/le retrait"}'::jsonb,
  "invoice_thank_you" = '{"en":"Thank you for choosing Aux petits bonheurs!","fr":"Merci d''avoir choisi Aux petits bonheurs !"}'::jsonb
WHERE "id" = 1 AND "invoice_payment_terms" IS NULL AND "invoice_thank_you" IS NULL;