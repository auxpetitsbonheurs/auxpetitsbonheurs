ALTER TYPE "public"."order_source" ADD VALUE 'workshop';--> statement-breakpoint
CREATE TABLE "workshop_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title_en" text NOT NULL,
	"title_fr" text,
	"description_en" text DEFAULT '' NOT NULL,
	"description_fr" text,
	"photo_path" text,
	"photo_variants" smallint[] DEFAULT '{}'::smallint[] NOT NULL,
	"event_on" date NOT NULL,
	"starts_at" text NOT NULL,
	"ends_at" text NOT NULL,
	"address" text NOT NULL,
	"map_url" text,
	"price_rs" integer NOT NULL,
	"capacity" smallint NOT NULL,
	"cake_options" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"cancel_reason" text,
	"cancelled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workshop_event_slug_unique" UNIQUE("slug"),
	CONSTRAINT "workshop_event_status_ck" CHECK ("workshop_event"."status" in ('draft', 'published', 'cancelled', 'completed')),
	CONSTRAINT "workshop_event_time_ck" CHECK ("workshop_event"."starts_at" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and "workshop_event"."ends_at" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and "workshop_event"."ends_at" > "workshop_event"."starts_at"),
	CONSTRAINT "workshop_event_money_ck" CHECK ("workshop_event"."price_rs" >= 0),
	CONSTRAINT "workshop_event_capacity_ck" CHECK ("workshop_event"."capacity" between 1 and 200),
	CONSTRAINT "workshop_event_options_ck" CHECK (jsonb_typeof("workshop_event"."cake_options") = 'array' and jsonb_array_length("workshop_event"."cake_options") between 1 and 10),
	CONSTRAINT "workshop_event_version_ck" CHECK ("workshop_event"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "workshop_event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workshop_registration" (
	"order_id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"cakes" smallint NOT NULL,
	"people_names" text,
	"allergies" text,
	CONSTRAINT "workshop_registration_cakes_ck" CHECK ("workshop_registration"."cakes" between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "workshop_registration" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workshop_event" ADD CONSTRAINT "workshop_event_created_by_admin_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_event" ADD CONSTRAINT "workshop_event_updated_by_admin_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."admin"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_registration" ADD CONSTRAINT "workshop_registration_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_registration" ADD CONSTRAINT "workshop_registration_event_id_workshop_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."workshop_event"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workshop_event_date_idx" ON "workshop_event" USING btree ("event_on");--> statement-breakpoint
CREATE INDEX "workshop_registration_event_idx" ON "workshop_registration" USING btree ("event_id");
--> statement-breakpoint
-- E-15 workshop events (ADR-0005; data-model "workshop_event", "workshop_registration"). Additive
-- and forward-only. The enum value, tables, checks and indexes above are generated (snapshot
-- 0026). `workshop` is used as a literal only inside plpgsql bodies: a new enum value is usable
-- only after its transaction commits. RLS is on with no policies, like every table (the app's
-- database role does every read and write; the public anon key reads nothing).
--
-- register_workshop: the whole registration in one CALL (one round trip, one transaction; ADR-0003
-- amendment 3), like submit_custom_request. Never oversells (S-300 AC3): the event row is locked
-- FOR UPDATE, so registrations to one event run one after the other, and the places held (cakes
-- of registrations whose order is active: not declined, cancelled or closed) are counted under
-- that lock before the insert. The application has parsed the form, checked Turnstile and the
-- rate limit; this decides only what needs the database. Results (`kind`):
--   existing  a known idempotency key: the order it created (the caller checks the email, G-21)
--   closed    no such event, not published, or its date has passed (`today`, Mauritius date)
--   option    a cake choice is not one of the event's options
--   full      not enough places left (`placesLeft`, possibly 0)
--   placed    the order, its items, the registration, the event and the outbox rows
-- Rollback: a later migration drops the procedure (registrations are rows, unaffected).
CREATE PROCEDURE "public"."register_workshop"(p_input jsonb, INOUT result jsonb)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key uuid := nullif(p_input->>'idempotencyKey', '')::uuid;
  v_order jsonb := p_input->'order';
  v_cakes jsonb := coalesce(p_input->'cakes', '[]'::jsonb);
  v_event workshop_event%ROWTYPE;
  v_existing jsonb;
  v_customer uuid;
  v_account uuid := nullif(p_input->'order'->>'accountCustomerId', '')::uuid;
  v_number integer;
  v_order_id uuid;
  v_count integer;
  v_held integer;
  v_constraint text;
  v_prefix text;
  v_total integer;
BEGIN
  SELECT s.order_number_prefix INTO v_prefix FROM settings s WHERE s.id = 1;
  IF v_key IS NOT NULL THEN
    SELECT jsonb_build_object('orderId', o.id, 'number', o.number, 'trackingToken', o.tracking_token, 'locale', o.locale,
        'contactEmail', o.contact_email, 'orderNumberPrefix', coalesce(o.number_prefix, v_prefix))
      INTO v_existing FROM orders o WHERE o.idempotency_key = v_key;
    IF v_existing IS NOT NULL THEN
      result := jsonb_build_object('kind', 'existing', 'existing', v_existing);
      RETURN;
    END IF;
  END IF;

  -- The lock: concurrent registrations to this event wait here, so each counts the others' places.
  SELECT * INTO v_event FROM workshop_event e WHERE e.id = (p_input->>'eventId')::uuid FOR UPDATE;
  IF NOT FOUND OR v_event.status <> 'published' OR v_event.event_on < (p_input->>'today')::date THEN
    result := jsonb_build_object('kind', 'closed');
    RETURN;
  END IF;

  IF jsonb_array_length(v_cakes) = 0 OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_cakes) c
    WHERE coalesce((c.value->>'quantity')::integer, 0) < 1
       OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_event.cake_options) x WHERE x.value->>'id' = c.value->>'optionId')
  ) THEN
    result := jsonb_build_object('kind', 'option');
    RETURN;
  END IF;
  SELECT sum((c.value->>'quantity')::integer) INTO v_count FROM jsonb_array_elements(v_cakes) c;

  SELECT coalesce(sum(r.cakes), 0) INTO v_held
    FROM workshop_registration r JOIN orders o ON o.id = r.order_id
    WHERE r.event_id = v_event.id AND o.status NOT IN ('declined', 'cancelled', 'closed');
  IF v_held + v_count > v_event.capacity THEN
    result := jsonb_build_object('kind', 'full', 'placesLeft', greatest(v_event.capacity - v_held, 0));
    RETURN;
  END IF;
  v_total := v_count * v_event.price_rs;

  BEGIN
    -- Customer: the signed-in account row (from the session, never the form), else the email, else new.
    IF v_account IS NOT NULL THEN
      SELECT c.id INTO v_customer FROM customer c WHERE c.id = v_account AND c.auth_user_id IS NOT NULL;
    END IF;
    IF v_customer IS NULL THEN
      SELECT c.id INTO v_customer FROM customer c WHERE lower(c.email) = lower(v_order->>'contactEmail') LIMIT 1;
    END IF;
    IF v_customer IS NULL THEN
      INSERT INTO customer (name, phone, email, locale)
        VALUES (v_order->>'contactName', v_order->>'contactPhone', lower(v_order->>'contactEmail'), (v_order->>'locale')::locale)
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_customer;
      IF v_customer IS NULL THEN
        SELECT c.id INTO v_customer FROM customer c WHERE lower(c.email) = lower(v_order->>'contactEmail') LIMIT 1;
      END IF;
      IF v_customer IS NULL THEN
        RAISE EXCEPTION 'customer insert conflicted but no row matches the email';
      END IF;
    END IF;

    UPDATE counter SET value = value + 1 WHERE name = 'order_number' RETURNING value INTO v_number;
    IF v_number IS NULL THEN
      RAISE EXCEPTION 'counter ''order_number'' is missing (run the migrations)';
    END IF;

    -- Approve then pay (ADR-0005): it waits for the bakery's answer; Accept moves it to awaiting_payment.
    INSERT INTO orders (
      number, source, status, customer_id, contact_name, contact_phone, contact_email, fulfilment, address, landmark,
      fulfil_on, time_window, items_total_rs, delivery_fee_rs, total_rs, customer_note, locale, tracking_token,
      idempotency_key, policies_accepted_at, by_account
    ) VALUES (
      v_number, 'workshop', 'pending_approval', v_customer, v_order->>'contactName', v_order->>'contactPhone', v_order->>'contactEmail',
      'pickup', NULL, NULL, v_event.event_on,
      jsonb_build_object('id', 'workshop', 'start', v_event.starts_at, 'end', v_event.ends_at,
        'label', jsonb_build_object('en', v_event.starts_at || '–' || v_event.ends_at, 'fr', v_event.starts_at || '–' || v_event.ends_at)),
      v_total, 0, v_total, nullif(v_order->>'note', ''), (v_order->>'locale')::locale, v_order->>'trackingToken',
      v_key, (v_order->>'policiesAcceptedAt')::timestamptz, coalesce(v_customer = v_account, false)
    ) RETURNING id INTO v_order_id;

    -- One line per cake choice; names and prices copied now (FR-012).
    INSERT INTO order_item (order_id, product_id, name_en, name_fr, original_base_price_rs, unit_base_price_rs, options, quantity, line_total_rs, sort_order)
      SELECT v_order_id, NULL, v_event.title_en, v_event.title_fr, v_event.price_rs, v_event.price_rs,
        jsonb_build_array(jsonb_build_object('groupId', 'cake', 'group', jsonb_build_object('en', 'Cake', 'fr', 'Gâteau'), 'kind', 'single',
          'choiceId', x.value->>'id', 'choice', x.value->'name', 'priceDeltaRs', 0)),
        (c.value->>'quantity')::integer, (c.value->>'quantity')::integer * v_event.price_rs, (c.ordinality - 1)::smallint
      FROM jsonb_array_elements(v_cakes) WITH ORDINALITY AS c(value, ordinality)
      JOIN LATERAL (SELECT y.value FROM jsonb_array_elements(v_event.cake_options) y WHERE y.value->>'id' = c.value->>'optionId' LIMIT 1) x ON true;

    INSERT INTO workshop_registration (order_id, event_id, cakes, people_names, allergies)
      VALUES (v_order_id, v_event.id, v_count, nullif(p_input->>'peopleNames', ''), nullif(p_input->>'allergies', ''));

    INSERT INTO order_event (order_id, actor_type, type, to_status, details)
      VALUES (v_order_id, 'customer', 'created', 'pending_approval', jsonb_build_object('workshopEventId', v_event.id, 'cakes', v_count));

    INSERT INTO email_outbox (template, to_email, locale, payload, order_id, dedupe_key)
      VALUES ('workshop_received', v_order->>'contactEmail', (v_order->>'locale')::locale, jsonb_build_object('orderId', v_order_id),
              v_order_id, 'order:' || v_order_id || ':workshop_received');

    -- Admin email alert: number, name, event and cakes only, never the allergies (S-307).
    INSERT INTO email_outbox (template, to_email, locale, payload, order_id, dedupe_key)
      SELECT 'admin_alert_new_workshop', a.email, a.locale, jsonb_build_object('orderId', v_order_id), v_order_id,
             'order:' || v_order_id || ':admin_alert:new_workshop:' || a.id
        FROM admin a WHERE a.active AND a.alert_email;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint IS DISTINCT FROM 'orders_idempotency_key_unique' THEN
      RAISE;
    END IF;
    SELECT jsonb_build_object('orderId', o.id, 'number', o.number, 'trackingToken', o.tracking_token, 'locale', o.locale,
        'contactEmail', o.contact_email, 'orderNumberPrefix', coalesce(o.number_prefix, v_prefix))
      INTO v_existing FROM orders o WHERE o.idempotency_key = v_key;
    result := jsonb_build_object('kind', 'existing', 'existing', v_existing);
    RETURN;
  END;

  result := jsonb_build_object('kind', 'placed', 'placed', jsonb_build_object('orderId', v_order_id, 'number', v_number,
    'trackingToken', v_order->>'trackingToken', 'locale', v_order->>'locale', 'orderNumberPrefix', v_prefix, 'totalRs', v_total));
END;
$$;