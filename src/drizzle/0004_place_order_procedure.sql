-- Place order in one database round trip (ADR-0003 amendment 3). Additive and forward-only:
-- a new procedure, no table change. Rollback: a later migration drops it; nothing else uses it.
--
-- The application (app/server/services/place-order.server.ts) parses the form, checks the
-- date and decides `insert`; this procedure, in one statement and one transaction:
--   1. returns the order that already owns the idempotency key (replay, S-014), or
--   2. reads the Settings row and the basket's products (the snapshot the application prices
--      with, also for every refusal), and, when `insert` is true and the window exists, at
--      least one line is available and the server total equals the displayed total,
--   3. writes customer, order number, order, items, event and outbox row, all or nothing.
-- Pricing here mirrors domain/pricing.ts (base price x quantity, delivery fee; sold-out,
-- hidden and deleted lines left out, ADR-0004); the application re-prices the snapshot and
-- logs any drift. E-05 (options, promotions) must change both.
-- A CALL is never cached by Hyperdrive (it caches only plain reads). SECURITY INVOKER: the
-- caller's own privileges and RLS apply. Not callable by the Supabase API roles.
CREATE PROCEDURE "public"."place_order"(p_input jsonb, INOUT result jsonb DEFAULT NULL)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key uuid := nullif(p_input->>'idempotencyKey', '')::uuid;
  v_basket jsonb := coalesce(p_input->'basket', '[]'::jsonb);
  v_order jsonb := p_input->'order';
  v_settings settings%ROWTYPE;
  v_settings_json jsonb;
  v_products jsonb;
  v_window jsonb;
  v_items_total integer;
  v_orderable integer;
  v_fee integer;
  v_customer uuid;
  v_number integer;
  v_order_id uuid;
  v_constraint text;
  v_existing jsonb;
BEGIN
  IF v_key IS NOT NULL THEN
    SELECT jsonb_build_object('orderId', o.id, 'number', o.number, 'trackingToken', o.tracking_token, 'locale', o.locale, 'contactEmail', o.contact_email,
        'orderNumberPrefix', (SELECT s.order_number_prefix FROM settings s WHERE s.id = 1))
      INTO v_existing FROM orders o WHERE o.idempotency_key = v_key;
    IF v_existing IS NOT NULL THEN
      result := jsonb_build_object('kind', 'existing', 'existing', v_existing);
      RETURN;
    END IF;
  END IF;

  SELECT * INTO v_settings FROM settings WHERE id = 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'settings row 1 is missing (run the migrations)';
  END IF;
  v_settings_json := jsonb_build_object(
    'deliveryFeeRs', v_settings.delivery_fee_rs,
    'deliveryWindows', v_settings.delivery_windows,
    'pickupWindows', v_settings.pickup_windows,
    'pickupAddress', v_settings.pickup_address,
    'pickupMapUrl', v_settings.pickup_map_url,
    'juiceNumber', v_settings.juice_number,
    'policies', v_settings.policies,
    'orderNumberPrefix', v_settings.order_number_prefix
  );

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'status', p.status, 'nameEn', p.name_en, 'nameFr', p.name_fr, 'basePriceRs', p.base_price_rs
  )), '[]'::jsonb)
    INTO v_products
    FROM product p
    WHERE p.id IN (SELECT (line->>'productId')::uuid FROM jsonb_array_elements(v_basket) line);

  result := jsonb_build_object('kind', 'checked', 'settings', v_settings_json, 'products', v_products);
  IF NOT coalesce((p_input->>'insert')::boolean, false) OR v_order IS NULL OR v_key IS NULL THEN
    RETURN;
  END IF;

  SELECT w INTO v_window
    FROM jsonb_array_elements(CASE WHEN v_order->>'fulfilment' = 'delivery' THEN v_settings.delivery_windows ELSE v_settings.pickup_windows END) w
    WHERE w->>'id' = v_order->>'windowId'
    LIMIT 1;
  IF v_window IS NULL THEN
    RETURN;
  END IF;

  SELECT count(*), coalesce(sum(p.base_price_rs * (line->>'quantity')::integer), 0)
    INTO v_orderable, v_items_total
    FROM jsonb_array_elements(v_basket) line
    JOIN product p ON p.id = (line->>'productId')::uuid AND p.status = 'available';
  v_fee := CASE WHEN v_order->>'fulfilment' = 'delivery' THEN v_settings.delivery_fee_rs ELSE 0 END;
  IF v_orderable = 0 OR v_items_total + v_fee <> (v_order->>'displayedTotalRs')::integer THEN
    RETURN;
  END IF;

  BEGIN
    SELECT c.id INTO v_customer FROM customer c WHERE lower(c.email) = lower(v_order->>'contactEmail') LIMIT 1;
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

    INSERT INTO orders (
      number, source, status, customer_id, contact_name, contact_phone, contact_email, fulfilment, address, landmark,
      fulfil_on, time_window, items_total_rs, delivery_fee_rs, total_rs, customer_note, locale, tracking_token,
      idempotency_key, policies_accepted_at
    ) VALUES (
      v_number, 'website', 'pending_approval', v_customer, v_order->>'contactName', v_order->>'contactPhone', v_order->>'contactEmail',
      (v_order->>'fulfilment')::fulfilment, v_order->>'address', v_order->>'landmark',
      (v_order->>'fulfilOn')::date, v_window, v_items_total, v_fee, v_items_total + v_fee, v_order->>'customerNote',
      (v_order->>'locale')::locale, v_order->>'trackingToken', v_key, (v_order->>'policiesAcceptedAt')::timestamptz
    ) RETURNING id INTO v_order_id;

    INSERT INTO order_item (order_id, product_id, name_en, name_fr, original_base_price_rs, unit_base_price_rs, cake_message, quantity, line_total_rs, sort_order)
      SELECT v_order_id, p.id, p.name_en, p.name_fr, p.base_price_rs, p.base_price_rs, nullif(line.value->>'cakeMessage', ''),
             (line.value->>'quantity')::integer, p.base_price_rs * (line.value->>'quantity')::integer,
             (row_number() OVER (ORDER BY line.ordinality) - 1)::smallint
        FROM jsonb_array_elements(v_basket) WITH ORDINALITY AS line(value, ordinality)
        JOIN product p ON p.id = (line.value->>'productId')::uuid AND p.status = 'available';

    INSERT INTO order_event (order_id, actor_type, type, to_status)
      VALUES (v_order_id, 'customer', 'created', 'pending_approval');

    INSERT INTO email_outbox (template, to_email, locale, payload, order_id, dedupe_key)
      VALUES ('order_received', v_order->>'contactEmail', (v_order->>'locale')::locale, jsonb_build_object('orderId', v_order_id),
              v_order_id, 'order:' || v_order_id || ':received');
  EXCEPTION WHEN unique_violation THEN
    -- Lost race on the key: both calls passed the lookup; ours is rolled back (no number consumed).
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint IS DISTINCT FROM 'orders_idempotency_key_unique' THEN
      RAISE;
    END IF;
    SELECT jsonb_build_object('orderId', o.id, 'number', o.number, 'trackingToken', o.tracking_token, 'locale', o.locale, 'contactEmail', o.contact_email,
        'orderNumberPrefix', (SELECT s.order_number_prefix FROM settings s WHERE s.id = 1))
      INTO v_existing FROM orders o WHERE o.idempotency_key = v_key;
    result := jsonb_build_object('kind', 'existing', 'existing', v_existing);
    RETURN;
  END;

  result := result || jsonb_build_object('kind', 'placed', 'placed',
    jsonb_build_object('orderId', v_order_id, 'number', v_number, 'trackingToken', v_order->>'trackingToken', 'locale', v_order->>'locale'));
END;
$$;
--> statement-breakpoint
REVOKE ALL ON PROCEDURE "public"."place_order"(jsonb, jsonb) FROM PUBLIC;--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON PROCEDURE "public"."place_order"(jsonb, jsonb) FROM anon; END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON PROCEDURE "public"."place_order"(jsonb, jsonb) FROM authenticated; END IF;
END $$;
