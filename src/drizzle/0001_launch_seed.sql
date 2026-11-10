-- 0001 launch seed (hand-written, S-004). Data only: no schema change.
-- Settings are editable later by the Owner (E-03); this row is the PRD A1 defaults.
-- LAUNCH: juice_number '5000 0000' is a FAKE PLACEHOLDER; replace it on deploy day
-- (README "Deploy" launch checklist). pickup_address is "Beau Bassin" until the
-- owner supplies the street address (spec gap).
INSERT INTO "settings" (
	"id", "default_notice_days", "closed_weekdays", "delivery_windows", "pickup_windows",
	"delivery_fee_rs", "pickup_address", "juice_number", "quote_validity_days",
	"cake_message_max", "evening_reminder_at", "order_number_prefix"
) VALUES (
	1, 3, '{7}'::smallint[],
	'[{"id":"morning","start":"09:00","end":"12:00","label":{"en":"Morning","fr":"Matin"}},{"id":"afternoon","start":"12:00","end":"17:00","label":{"en":"Afternoon","fr":"Après-midi"}},{"id":"evening","start":"17:00","end":"20:00","label":{"en":"Evening","fr":"Soir"}}]'::jsonb,
	'[{"id":"morning","start":"09:00","end":"12:00","label":{"en":"Morning","fr":"Matin"}},{"id":"afternoon","start":"12:00","end":"17:00","label":{"en":"Afternoon","fr":"Après-midi"}},{"id":"evening","start":"17:00","end":"20:00","label":{"en":"Evening","fr":"Soir"}}]'::jsonb,
	200, 'Beau Bassin', '5000 0000', 5,
	40, '18:00', 'APB-'
) ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "counter" ("name", "value") VALUES ('order_number', 0) ON CONFLICT ("name") DO NOTHING;
--> statement-breakpoint
-- Supabase Storage buckets (NFR-009): 1 MB after browser-side compression, images only.
-- public-images: public CDN reads; writes only via server-issued signed upload URLs.
-- request-photos: private; admins read via short-lived signed URLs.
INSERT INTO "storage"."buckets" ("id", "name", "public", "file_size_limit", "allowed_mime_types")
VALUES
	('public-images', 'public-images', true, 1048576, ARRAY['image/jpeg', 'image/png', 'image/webp']),
	('request-photos', 'request-photos', false, 1048576, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT ("id") DO UPDATE SET
	"public" = EXCLUDED."public",
	"file_size_limit" = EXCLUDED."file_size_limit",
	"allowed_mime_types" = EXCLUDED."allowed_mime_types";
