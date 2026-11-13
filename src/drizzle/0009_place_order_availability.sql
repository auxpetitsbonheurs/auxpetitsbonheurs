-- Place order: the date rules (S-083 notice, closed weekdays, blocked ranges, 90-day horizon;
-- S-084 seasonal windows judged on the fulfilment date). Additive and forward-only: the same
-- procedure (0004) replaced with three additions, no table change; grants are kept by
-- CREATE OR REPLACE. Rollback: a later migration restores the 0004 body.
--   1. input `today` (the request's Mauritius date, so tests use a fixed clock; the
--      database date only when it is missing);
--   2. the snapshot adds Settings `defaultNoticeDays`, `closedWeekdays`, `blocked` (ranges
--      only, never the private reason) and each product's `noticeDays` and season window,
--      so the application judges the date with domain/availability.ts and names the reason;
--   3. no write when the date breaks a rule (mirrors domain/availability.ts; the
--      application logs any drift, as for prices).
CREATE OR REPLACE PROCEDURE "public"."place_order"(p_input jsonb, INOUT result jsonb DEFAULT NULL)
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
  v_today date := coalesce(nullif(p_input->>'today', '')::date, (now() AT TIME ZONE 'Indian/Mauritius')::date);
  v_fulfil_on date;
  v_notice integer;
  v_in_season boolean;
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
    'orderNumberPrefix', v_settings.order_number_prefix,
    'defaultNoticeDays', v_settings.default_notice_days,
    'closedWeekdays', to_jsonb(v_settings.closed_weekdays),
    -- Ranges only, never the private reason (FR-014); those that touch the 90-day horizon.
    'blocked', coalesce((
      SELECT jsonb_agg(jsonb_build_object('startsOn', to_char(b.starts_on, 'YYYY-MM-DD'), 'endsOn', to_char(b.ends_on, 'YYYY-MM-DD')) ORDER BY b.starts_on, b.ends_on)
        FROM blocked_date b WHERE b.ends_on >= v_today AND b.starts_on < v_today + 90
    ), '[]'::jsonb)
  );

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'status', p.status, 'nameEn', p.name_en, 'nameFr', p.name_fr, 'basePriceRs', p.base_price_rs,
    'noticeDays', p.notice_days, 'seasonStartsOn', to_char(p.seasonal_starts_on, 'YYYY-MM-DD'), 'seasonEndsOn', to_char(p.seasonal_ends_on, 'YYYY-MM-DD')
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

  -- The date, as domain/availability.ts judges it (S-083, S-084): notice = the largest of the
  -- orderable lines (unset = default), inside the 90-day horizon, not a closed weekday, not
  -- blocked, inside every orderable seasonal line's window. Any failure only stops the
  -- write; the application names the reason from the snapshot.
  v_fulfil_on := (v_order->>'fulfilOn')::date;
  SELECT coalesce(max(coalesce(p.notice_days, v_settings.default_notice_days)), v_settings.default_notice_days),
         coalesce(bool_and(p.seasonal_starts_on IS NULL OR v_fulfil_on BETWEEN p.seasonal_starts_on AND p.seasonal_ends_on), true)
    INTO v_notice, v_in_season
    FROM jsonb_array_elements(v_basket) line
    JOIN product p ON p.id = (line->>'productId')::uuid AND p.status = 'available';
  IF v_fulfil_on < v_today + v_notice OR v_fulfil_on >= v_today + 90
     OR extract(isodow FROM v_fulfil_on)::smallint = ANY (v_settings.closed_weekdays)
     OR EXISTS (SELECT FROM blocked_date b WHERE v_fulfil_on BETWEEN b.starts_on AND b.ends_on)
     OR NOT v_in_season THEN
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
