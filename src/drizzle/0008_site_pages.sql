CREATE TABLE "site_page" (
	"key" text PRIMARY KEY NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"event" jsonb,
	"is_placeholder" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "site_page_key_ck" CHECK ("site_page"."key" in ('our_story', 'workshops', 'gallery', 'contact', 'custom_order'))
);
--> statement-breakpoint
ALTER TABLE "site_page" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "site_page_photo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_key" text NOT NULL,
	"role" text DEFAULT 'page' NOT NULL,
	"storage_path" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"alt_en" text NOT NULL,
	"alt_fr" text,
	"sort_order" smallint NOT NULL,
	CONSTRAINT "site_page_photo_storage_path_unique" UNIQUE("storage_path"),
	CONSTRAINT "site_page_photo_slot_key" UNIQUE("page_key","role","sort_order"),
	CONSTRAINT "site_page_photo_size_ck" CHECK ("site_page_photo"."width" > 0 and "site_page_photo"."height" > 0),
	CONSTRAINT "site_page_photo_slot_ck" CHECK (("site_page_photo"."role" = 'page' and (
            ("site_page_photo"."page_key" = 'our_story' and "site_page_photo"."sort_order" between 0 and 3)
            or ("site_page_photo"."page_key" = 'workshops' and "site_page_photo"."sort_order" between 0 and 5)
            or ("site_page_photo"."page_key" = 'custom_order' and "site_page_photo"."sort_order" between 0 and 2)))
        or ("site_page_photo"."role" = 'event' and "site_page_photo"."page_key" = 'workshops' and "site_page_photo"."sort_order" = 0))
);
--> statement-breakpoint
ALTER TABLE "site_page_photo" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "site_page" ADD CONSTRAINT "site_page_updated_by_admin_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."admin"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_page_photo" ADD CONSTRAINT "site_page_photo_page_key_site_page_key_fk" FOREIGN KEY ("page_key") REFERENCES "public"."site_page"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- S-245 AC2: every page exists with neutral sample text (copywriter, EN and FR; no facts,
-- prices or dates), marked as placeholder (noindex, "Sample text" badge in admin) until
-- the first save. E-12 S-222 replaces it. Re-running inserts nothing new.
INSERT INTO "site_page" ("key", "content") VALUES
('our_story', '{"intro":{"en":"Sample text: a short welcome that says who we are will go here.","fr":"Texte d''exemple : un court mot d''accueil pour nous présenter figurera ici."},"body":{"en":"Sample text. This is where the bakery will tell its story: how it started, who bakes, and what matters in every cake.\n\nThe real story will replace this text soon.","fr":"Texte d''exemple. Ici, la pâtisserie racontera son histoire : ses débuts, qui prépare les gâteaux et ce qui compte dans chacun d''eux.\n\nLe vrai texte remplacera bientôt celui-ci."}}'::jsonb),
('workshops', '{"intro":{"en":"Sample text: a short introduction to our workshops will go here.","fr":"Texte d''exemple : une courte présentation de nos ateliers figurera ici."},"body":{"en":"Sample text. This section will explain how our workshops work: who they are for, what you make together, and how to ask about the next one.\n\nThe real text will replace this soon.","fr":"Texte d''exemple. Cette partie expliquera le déroulement de nos ateliers : à qui ils s''adressent, ce que l''on y prépare ensemble et comment se renseigner sur le prochain.\n\nLe vrai texte remplacera bientôt celui-ci."}}'::jsonb),
('gallery', '{"intro":{"en":"Sample text: a few words to introduce our photos will go here.","fr":"Texte d''exemple : quelques mots pour présenter nos photos figureront ici."}}'::jsonb),
('contact', '{"intro":{"en":"Sample text: a short note on the best way to reach us will go here.","fr":"Texte d''exemple : un court mot sur la meilleure façon de nous joindre figurera ici."},"hours":{"en":"Sample text: our opening hours will be listed here.","fr":"Texte d''exemple : nos horaires d''ouverture figureront ici."},"pickup_note":{"en":"Sample text: how to collect your order will be explained here.","fr":"Texte d''exemple : la façon de récupérer votre commande sera expliquée ici."}}'::jsonb),
('custom_order', '{"intro":{"en":"Sample text: a short introduction to custom cakes will go here.","fr":"Texte d''exemple : une courte présentation des gâteaux sur mesure figurera ici."},"body":{"en":"Sample text. This section will explain how a custom cake works, from your first message to the day you collect it.\n\nThe real text will replace this soon.","fr":"Texte d''exemple. Cette partie expliquera comment se déroule une commande de gâteau sur mesure, de votre premier message au jour du retrait.\n\nLe vrai texte remplacera bientôt celui-ci."}}'::jsonb)
ON CONFLICT ("key") DO NOTHING;