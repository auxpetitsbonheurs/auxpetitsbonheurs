-- Bakery reviews (E-14 S-261): `review` (one per customer account, deleted with it; rating 1..5,
-- comment 1..1000 trimmed, display name, status pending/approved/rejected/hidden, decision and
-- version) and `review_event` (who decided what, never the text). RLS on, no policies: the app's
-- role does every read and write and checks the session. Additive, forward-only; rollback is a
-- later migration dropping both tables and the two enums.
CREATE TYPE "public"."review_action" AS ENUM('approve', 'reject', 'hide', 'show', 'delete', 'undo');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending', 'approved', 'rejected', 'hidden');--> statement-breakpoint
CREATE TABLE "review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"comment" text NOT NULL,
	"display_name" text NOT NULL,
	"locale" "locale" NOT NULL,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_rating_ck" CHECK ("review"."rating" between 1 and 5),
	CONSTRAINT "review_comment_ck" CHECK (char_length(btrim("review"."comment")) between 1 and 1000 and "review"."comment" = btrim("review"."comment")),
	CONSTRAINT "review_display_name_ck" CHECK (char_length(btrim("review"."display_name")) between 1 and 80),
	CONSTRAINT "review_version_ck" CHECK ("review"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "review" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "review_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"action" "review_action" NOT NULL,
	"admin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "review_event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_decided_by_admin_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."admin"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_event" ADD CONSTRAINT "review_event_admin_id_admin_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "review_customer_key" ON "review" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "review_approved_idx" ON "review" USING btree ("decided_at" DESC NULLS LAST) WHERE "review"."status" = 'approved';--> statement-breakpoint
CREATE INDEX "review_status_idx" ON "review" USING btree ("status","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "review_event_review_idx" ON "review_event" USING btree ("review_id","created_at");