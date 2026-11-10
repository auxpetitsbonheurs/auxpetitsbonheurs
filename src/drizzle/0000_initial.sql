CREATE TYPE "public"."actor_type" AS ENUM('admin', 'customer', 'system');--> statement-breakpoint
CREATE TYPE "public"."admin_role" AS ENUM('owner', 'admin');--> statement-breakpoint
CREATE TYPE "public"."discount_kind" AS ENUM('percent', 'sale_price');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('pending', 'sent', 'dead');--> statement-breakpoint
CREATE TYPE "public"."fulfilment" AS ENUM('delivery', 'pickup');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('en', 'fr');--> statement-breakpoint
CREATE TYPE "public"."option_kind" AS ENUM('single', 'multiple', 'text', 'quantity');--> statement-breakpoint
CREATE TYPE "public"."order_source" AS ENUM('website', 'custom_request', 'manual');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending_approval', 'quote_needed', 'quote_sent', 'approved', 'in_preparation', 'ready_for_pickup', 'out_for_delivery', 'completed', 'declined', 'cancelled', 'closed');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('available', 'sold_out', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."product_type" AS ENUM('cake', 'cupcake_box', 'dessert', 'seasonal');--> statement-breakpoint
CREATE TYPE "public"."promo_link" AS ENUM('none', 'product', 'category', 'custom_request');--> statement-breakpoint
CREATE TYPE "public"."promo_placement" AS ENUM('banner', 'card', 'both');--> statement-breakpoint
CREATE TABLE "admin" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" "admin_role" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"alert_push" boolean DEFAULT true NOT NULL,
	"alert_email" boolean DEFAULT true NOT NULL,
	"locale" "locale" DEFAULT 'en' NOT NULL,
	"last_sign_in_at" timestamp with time zone,
	"deactivated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "admin" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "admin_invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "admin_role" NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_invitation_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "admin_invitation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "customer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"locale" "locale" DEFAULT 'en' NOT NULL,
	"auth_user_id" uuid,
	"admin_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "customer_address" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"label" text,
	"address" text NOT NULL,
	"landmark" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_address" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "gallery_photo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_path" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"occasion" text,
	"caption_en" text,
	"caption_fr" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gallery_photo" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "option_choice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"name_en" text NOT NULL,
	"name_fr" text,
	"price_delta_rs" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "option_choice" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "option_group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"name_en" text NOT NULL,
	"name_fr" text,
	"kind" "option_kind" NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"text_max_length" smallint,
	"quantity_min" smallint,
	"quantity_max" smallint,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "option_group_text_ck" CHECK ("option_group"."text_max_length" is null or "option_group"."kind" = 'text'),
	CONSTRAINT "option_group_qty_ck" CHECK (("option_group"."quantity_min" is null and "option_group"."quantity_max" is null)
        or ("option_group"."kind" = 'quantity' and "option_group"."quantity_min" <= "option_group"."quantity_max"))
);
--> statement-breakpoint
ALTER TABLE "option_group" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "product" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"type" "product_type" NOT NULL,
	"category" text,
	"name_en" text NOT NULL,
	"name_fr" text,
	"description_en" text,
	"description_fr" text,
	"base_price_rs" integer NOT NULL,
	"allergens" text[] DEFAULT '{}'::text[] NOT NULL,
	"notice_days" smallint,
	"min_quantity" smallint,
	"status" "product_status" DEFAULT 'available' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"seasonal_starts_on" date,
	"seasonal_ends_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_slug_unique" UNIQUE("slug"),
	CONSTRAINT "product_price_ck" CHECK ("product"."base_price_rs" >= 0),
	CONSTRAINT "product_notice_ck" CHECK ("product"."notice_days" is null or "product"."notice_days" between 0 and 60),
	CONSTRAINT "product_min_quantity_ck" CHECK ("product"."min_quantity" is null or "product"."min_quantity" between 1 and 50),
	CONSTRAINT "product_season_ck" CHECK (("product"."seasonal_starts_on" is null and "product"."seasonal_ends_on" is null)
        or ("product"."seasonal_starts_on" is not null and "product"."seasonal_ends_on" >= "product"."seasonal_starts_on"))
);
--> statement-breakpoint
ALTER TABLE "product" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "product_photo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"sort_order" smallint NOT NULL,
	CONSTRAINT "product_photo_slot_key" UNIQUE("product_id","sort_order"),
	CONSTRAINT "product_photo_slot_ck" CHECK ("product_photo"."sort_order" between 0 and 4)
);
--> statement-breakpoint
ALTER TABLE "product_photo" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "product_slug_history" (
	"slug" text PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_slug_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "promotion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title_en" text NOT NULL,
	"title_fr" text,
	"text_en" text,
	"text_fr" text,
	"image_path" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"placement" "promo_placement" NOT NULL,
	"link_kind" "promo_link" DEFAULT 'none' NOT NULL,
	"link_product_id" uuid,
	"link_category" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promotion_window_ck" CHECK ("promotion"."ends_at" > "promotion"."starts_at"),
	CONSTRAINT "promotion_link_ck" CHECK (("promotion"."link_kind" = 'category') = ("promotion"."link_category" is not null)
        and ("promotion"."link_kind" = 'product' or "promotion"."link_product_id" is null))
);
--> statement-breakpoint
ALTER TABLE "promotion" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "promotion_product" (
	"promotion_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"discount_kind" "discount_kind" NOT NULL,
	"percent_off" smallint,
	"sale_price_rs" integer,
	CONSTRAINT "promotion_product_promotion_id_product_id_pk" PRIMARY KEY("promotion_id","product_id"),
	CONSTRAINT "promotion_product_discount_ck" CHECK (("promotion_product"."discount_kind" = 'percent' and "promotion_product"."percent_off" between 1 and 99 and "promotion_product"."sale_price_rs" is null)
        or ("promotion_product"."discount_kind" = 'sale_price' and "promotion_product"."sale_price_rs" >= 0 and "promotion_product"."percent_off" is null))
);
--> statement-breakpoint
ALTER TABLE "promotion_product" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "custom_request" (
	"order_id" uuid PRIMARY KEY NOT NULL,
	"occasion" text,
	"servings" smallint,
	"flavours" text,
	"theme" text,
	"cake_text" text,
	"budget_rs" integer,
	"details" text,
	"quote_amount_rs" integer,
	"quote_note" text,
	"quote_expires_on" date,
	"quote_sent_at" timestamp with time zone,
	"quote_sent_by" uuid,
	CONSTRAINT "custom_request_quote_ck" CHECK (("custom_request"."quote_amount_rs" is null and "custom_request"."quote_expires_on" is null)
        or ("custom_request"."quote_amount_rs" >= 0 and "custom_request"."quote_expires_on" is not null))
);
--> statement-breakpoint
ALTER TABLE "custom_request" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "custom_request_photo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"sort_order" smallint NOT NULL,
	"source_gallery_photo_id" uuid,
	CONSTRAINT "custom_request_photo_slot_key" UNIQUE("order_id","sort_order"),
	CONSTRAINT "custom_request_photo_slot_ck" CHECK ("custom_request_photo"."sort_order" between 0 and 4)
);
--> statement-breakpoint
ALTER TABLE "custom_request_photo" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "order_event" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "order_event_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"order_id" uuid NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_admin_id" uuid,
	"type" text NOT NULL,
	"from_status" "order_status",
	"to_status" "order_status",
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_event_actor_ck" CHECK (("order_event"."actor_type" = 'admin') = ("order_event"."actor_admin_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "order_event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "order_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid,
	"name_en" text NOT NULL,
	"name_fr" text,
	"original_base_price_rs" integer NOT NULL,
	"unit_base_price_rs" integer NOT NULL,
	"promotion_id" uuid,
	"promotion_title_en" text,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cake_message" text,
	"quantity" integer NOT NULL,
	"line_total_rs" integer NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "order_item_qty_ck" CHECK ("order_item"."quantity" > 0),
	CONSTRAINT "order_item_money_ck" CHECK ("order_item"."line_total_rs" >= 0 and "order_item"."unit_base_price_rs" >= 0 and "order_item"."original_base_price_rs" >= 0)
);
--> statement-breakpoint
ALTER TABLE "order_item" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer NOT NULL,
	"source" "order_source" NOT NULL,
	"status" "order_status" NOT NULL,
	"customer_id" uuid NOT NULL,
	"contact_name" text NOT NULL,
	"contact_phone" text NOT NULL,
	"contact_email" text,
	"fulfilment" "fulfilment" NOT NULL,
	"address" text,
	"landmark" text,
	"fulfil_on" date NOT NULL,
	"time_window" jsonb NOT NULL,
	"items_total_rs" integer NOT NULL,
	"delivery_fee_rs" integer DEFAULT 0 NOT NULL,
	"total_rs" integer NOT NULL,
	"total_overridden" boolean DEFAULT false NOT NULL,
	"paid" boolean DEFAULT false NOT NULL,
	"paid_at" timestamp with time zone,
	"paid_by" uuid,
	"customer_note" text,
	"admin_note" text,
	"decline_reason" text,
	"locale" "locale" NOT NULL,
	"tracking_token" text NOT NULL,
	"idempotency_key" uuid,
	"policies_accepted_at" timestamp with time zone,
	"pending_alert_sent_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_number_unique" UNIQUE("number"),
	CONSTRAINT "orders_tracking_token_unique" UNIQUE("tracking_token"),
	CONSTRAINT "orders_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "orders_address_ck" CHECK ("orders"."fulfilment" = 'pickup' or "orders"."address" is not null),
	CONSTRAINT "orders_money_ck" CHECK ("orders"."items_total_rs" >= 0 and "orders"."delivery_fee_rs" >= 0 and "orders"."total_rs" >= 0),
	CONSTRAINT "orders_paid_ck" CHECK ("orders"."paid" or ("orders"."paid_at" is null and "orders"."paid_by" is null)),
	CONSTRAINT "orders_version_ck" CHECK ("orders"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "blocked_date" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocked_date_range_ck" CHECK ("blocked_date"."ends_on" >= "blocked_date"."starts_on")
);
--> statement-breakpoint
ALTER TABLE "blocked_date" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"default_notice_days" smallint DEFAULT 3 NOT NULL,
	"closed_weekdays" smallint[] DEFAULT '{7}'::smallint[] NOT NULL,
	"delivery_windows" jsonb NOT NULL,
	"pickup_windows" jsonb NOT NULL,
	"delivery_fee_rs" integer DEFAULT 200 NOT NULL,
	"pickup_address" text,
	"pickup_map_url" text,
	"contact_phone" text,
	"contact_whatsapp" text,
	"contact_email" text,
	"juice_number" text,
	"instagram_url" text,
	"hero" jsonb,
	"featured_product_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"about" jsonb,
	"about_image_path" text,
	"faq" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"policies" jsonb,
	"privacy_note" jsonb,
	"whatsapp_templates" jsonb,
	"quote_validity_days" smallint DEFAULT 5 NOT NULL,
	"cake_message_max" smallint DEFAULT 40 NOT NULL,
	"evening_reminder_at" text DEFAULT '18:00' NOT NULL,
	"order_number_prefix" text DEFAULT 'APB-' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "settings_singleton_ck" CHECK ("settings"."id" = 1),
	CONSTRAINT "settings_values_ck" CHECK ("settings"."default_notice_days" >= 0 and "settings"."delivery_fee_rs" >= 0
        and "settings"."quote_validity_days" >= 1 and "settings"."cake_message_max" >= 1)
);
--> statement-breakpoint
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "counter" (
	"name" text PRIMARY KEY NOT NULL,
	"value" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "counter" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template" text NOT NULL,
	"to_email" text NOT NULL,
	"locale" "locale" NOT NULL,
	"payload" jsonb NOT NULL,
	"order_id" uuid,
	"dedupe_key" text NOT NULL,
	"status" "email_status" DEFAULT 'pending' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"provider_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "email_outbox_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
ALTER TABLE "email_outbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "job_run" (
	"job" text NOT NULL,
	"run_key" text NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_run_job_run_key_pk" PRIMARY KEY("job","run_key")
);
--> statement-breakpoint
ALTER TABLE "job_run" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "push_subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"failure_count" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_success_at" timestamp with time zone,
	CONSTRAINT "push_subscription_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
ALTER TABLE "push_subscription" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rate_limit_bucket" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limit_bucket_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
ALTER TABLE "rate_limit_bucket" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "admin" ADD CONSTRAINT "admin_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_invitation" ADD CONSTRAINT "admin_invitation_invited_by_admin_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."admin"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_auth_user_id_users_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_address" ADD CONSTRAINT "customer_address_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_choice" ADD CONSTRAINT "option_choice_group_id_option_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."option_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_group" ADD CONSTRAINT "option_group_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_photo" ADD CONSTRAINT "product_photo_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_slug_history" ADD CONSTRAINT "product_slug_history_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion" ADD CONSTRAINT "promotion_link_product_id_product_id_fk" FOREIGN KEY ("link_product_id") REFERENCES "public"."product"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion" ADD CONSTRAINT "promotion_created_by_admin_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_product" ADD CONSTRAINT "promotion_product_promotion_id_promotion_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_product" ADD CONSTRAINT "promotion_product_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_request" ADD CONSTRAINT "custom_request_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_request" ADD CONSTRAINT "custom_request_quote_sent_by_admin_id_fk" FOREIGN KEY ("quote_sent_by") REFERENCES "public"."admin"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_request_photo" ADD CONSTRAINT "custom_request_photo_order_id_custom_request_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."custom_request"("order_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_request_photo" ADD CONSTRAINT "custom_request_photo_source_gallery_photo_id_gallery_photo_id_fk" FOREIGN KEY ("source_gallery_photo_id") REFERENCES "public"."gallery_photo"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_event" ADD CONSTRAINT "order_event_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_event" ADD CONSTRAINT "order_event_actor_admin_id_admin_id_fk" FOREIGN KEY ("actor_admin_id") REFERENCES "public"."admin"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_promotion_id_promotion_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotion"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_paid_by_admin_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."admin"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocked_date" ADD CONSTRAINT "blocked_date_created_by_admin_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_admin_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."admin"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_admin_id_admin_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_invitation_email_idx" ON "admin_invitation" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_email_key" ON "customer" USING btree ("email") WHERE "customer"."email" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_auth_user_key" ON "customer" USING btree ("auth_user_id") WHERE "customer"."auth_user_id" is not null;--> statement-breakpoint
CREATE INDEX "customer_phone_idx" ON "customer" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "customer_address_customer_idx" ON "customer_address" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_address_default_uq" ON "customer_address" USING btree ("customer_id") WHERE "customer_address"."is_default";--> statement-breakpoint
CREATE INDEX "gallery_photo_occasion_idx" ON "gallery_photo" USING btree ("occasion","sort_order");--> statement-breakpoint
CREATE INDEX "option_choice_group_idx" ON "option_choice" USING btree ("group_id","sort_order");--> statement-breakpoint
CREATE INDEX "option_group_product_idx" ON "option_group" USING btree ("product_id","sort_order");--> statement-breakpoint
CREATE INDEX "product_menu_idx" ON "product" USING btree ("status","type","sort_order");--> statement-breakpoint
CREATE INDEX "product_slug_history_product_idx" ON "product_slug_history" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "promotion_window_idx" ON "promotion" USING btree ("starts_at","ends_at") WHERE "promotion"."active";--> statement-breakpoint
CREATE INDEX "promotion_product_product_idx" ON "promotion_product" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "order_event_order_idx" ON "order_event" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "order_item_order_idx" ON "order_item" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_item_product_idx" ON "order_item" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "orders_status_date_idx" ON "orders" USING btree ("status","fulfil_on");--> statement-breakpoint
CREATE INDEX "orders_calendar_idx" ON "orders" USING btree ("fulfil_on") WHERE "orders"."status" not in ('declined', 'cancelled', 'closed');--> statement-breakpoint
CREATE INDEX "orders_customer_idx" ON "orders" USING btree ("customer_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "orders_pending_alert_idx" ON "orders" USING btree ("created_at") WHERE "orders"."status" = 'pending_approval' and "orders"."pending_alert_sent_at" is null;--> statement-breakpoint
CREATE INDEX "blocked_date_range_idx" ON "blocked_date" USING btree ("starts_on","ends_on");--> statement-breakpoint
CREATE INDEX "email_outbox_due_idx" ON "email_outbox" USING btree ("next_attempt_at") WHERE "email_outbox"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "push_subscription_admin_idx" ON "push_subscription" USING btree ("admin_id");