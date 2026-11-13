-- Usage counters for customer accounts (S-217, NFR-011): one row per Mauritius day, event and
-- property set, with a count; no personal data, no user id. Additive and forward-only; rollback
-- is a later migration dropping the table (nothing reads it on a page).
CREATE TABLE "usage_counter" (
	"day" date NOT NULL,
	"event" text NOT NULL,
	"props" text DEFAULT '' NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_counter_day_event_props_pk" PRIMARY KEY("day","event","props")
);
--> statement-breakpoint
ALTER TABLE "usage_counter" ENABLE ROW LEVEL SECURITY;