-- Approve, then pay (Owner decision 2026-11-14; juice-payment spec, contracts v0.58). Hand-written,
-- forward-only. place_order is the 0021 body (account, promotions, options, availability, all kept
-- unchanged) except that a website order now starts as `pending_approval` (status and its `created`
-- event) instead of `awaiting_payment`. Its payment clock (`awaiting_payment_since`) stays null until
-- an admin approves it, which moves it to `awaiting_payment` and starts the 12 h reminder and the 24 h
-- unpaid cancel. place_order_limited (0019) calls place_order and needs no change.
-- Orders already in `awaiting_payment` are left as they are (their clock is their placement).
-- Rollback: a later migration restores the 0021 body.
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
  -- 0012: the request instant (the application's clock, as `today`), for the promotion window.
  v_now timestamptz := coalesce(nullif(p_input->>'now', '')::timestamptz, now());
  v_fulfil_on date;
  v_notice integer;
  v_in_season boolean;
  v_lines jsonb;
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
    'juiceName', v_settings.juice_name,
    'juiceNumber', v_settings.juice_number,
    'paymentWhatsapp', v_settings.payment_whatsapp,
    'policies', v_settings.policies,
    'orderNumberPrefix', v_settings.order_number_prefix,
    'defaultNoticeDays', v_settings.default_notice_days,
    'closedWeekdays', to_jsonb(v_settings.closed_weekdays),
    'cakeMessageMax', v_settings.cake_message_max,
    -- Ranges only, never the private reason (FR-014); those that touch the 90-day horizon.
    'blocked', coalesce((
      SELECT jsonb_agg(jsonb_build_object('startsOn', to_char(b.starts_on, 'YYYY-MM-DD'), 'endsOn', to_char(b.ends_on, 'YYYY-MM-DD')) ORDER BY b.starts_on, b.ends_on)
        FROM blocked_date b WHERE b.ends_on >= v_today AND b.starts_on < v_today + 90
    ), '[]'::jsonb)
  );

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'status', p.status, 'nameEn', p.name_en, 'nameFr', p.name_fr, 'basePriceRs', p.base_price_rs,
    'noticeDays', p.notice_days, 'seasonStartsOn', to_char(p.seasonal_starts_on, 'YYYY-MM-DD'), 'seasonEndsOn', to_char(p.seasonal_ends_on, 'YYYY-MM-DD'),
    'minQuantity', p.min_quantity,
    -- 0012 (S-082): the active promotions covering the product that have not ended, so the
    -- application prices with domain/promotions (the same rules as product_promotion).
    'promotions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', pr.id, 'titleEn', pr.title_en, 'startsAt', pr.starts_at, 'endsAt', pr.ends_at, 'active', pr.active, 'placement', pr.placement,
        'discountKind', pp.discount_kind, 'percentOff', pp.percent_off, 'salePriceRs', pp.sale_price_rs
      ) ORDER BY pr.starts_at, pr.id)
      FROM promotion_product pp JOIN promotion pr ON pr.id = pp.promotion_id
      WHERE pp.product_id = p.id AND pr.active AND pr.ends_at > v_now
    ), '[]'::jsonb),
    'optionGroups', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', og.id, 'name', jsonb_build_object('en', og.name_en, 'fr', og.name_fr), 'kind', og.kind, 'required', og.required,
        'textMaxLength', og.text_max_length, 'quantityMin', og.quantity_min, 'quantityMax', og.quantity_max,
        'choices', coalesce((
          SELECT jsonb_agg(jsonb_build_object('id', oc.id, 'name', jsonb_build_object('en', oc.name_en, 'fr', oc.name_fr), 'priceDeltaRs', oc.price_delta_rs) ORDER BY oc.sort_order, oc.id)
          FROM option_choice oc WHERE oc.group_id = og.id
        ), '[]'::jsonb)
      ) ORDER BY og.sort_order, og.id)
      FROM option_group og WHERE og.product_id = p.id
    ), '[]'::jsonb)
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

  -- Orderable lines: available, in season today, and a selection valid now, each priced with
  -- its options (order_line_price) on the base price or, when a promotion is live now, the
  -- lowest sale price (product_promotion, 0012; options are never discounted).
  SELECT coalesce(jsonb_agg(jsonb_build_object('productId', p.id, 'quantity', (line.value->>'quantity')::integer,
           'cakeMessage', nullif(line.value->>'cakeMessage', ''), 'priced', x.priced, 'promo', pm.promo) ORDER BY line.ordinality), '[]'::jsonb)
    INTO v_lines
    FROM jsonb_array_elements(v_basket) WITH ORDINALITY AS line(value, ordinality)
    JOIN product p ON p.id = (line.value->>'productId')::uuid AND p.status = 'available'
      AND (p.seasonal_starts_on IS NULL OR v_today BETWEEN p.seasonal_starts_on AND p.seasonal_ends_on)
    CROSS JOIN LATERAL (SELECT product_promotion(p.id, p.base_price_rs, v_now) AS promo) pm
    CROSS JOIN LATERAL (SELECT order_line_price(line.value, p.id, coalesce((pm.promo->>'salePriceRs')::integer, p.base_price_rs), p.min_quantity, v_settings.cake_message_max) AS priced) x
    WHERE x.priced IS NOT NULL;

  -- The date, as domain/availability.ts judges it (S-083, S-084): notice = the largest of the
  -- orderable lines (unset = default), inside the 90-day horizon, not a closed weekday, not
  -- blocked, inside every orderable seasonal line's window. Any failure only stops the
  -- write; the application names the reason from the snapshot.
  v_fulfil_on := (v_order->>'fulfilOn')::date;
  SELECT coalesce(max(coalesce(p.notice_days, v_settings.default_notice_days)), v_settings.default_notice_days),
         coalesce(bool_and(p.seasonal_starts_on IS NULL OR v_fulfil_on BETWEEN p.seasonal_starts_on AND p.seasonal_ends_on), true)
    INTO v_notice, v_in_season
    FROM jsonb_array_elements(v_lines) line
    JOIN product p ON p.id = (line->>'productId')::uuid;
  IF v_fulfil_on < v_today + v_notice OR v_fulfil_on >= v_today + 90
     OR extract(isodow FROM v_fulfil_on)::smallint = ANY (v_settings.closed_weekdays)
     OR EXISTS (SELECT FROM blocked_date b WHERE v_fulfil_on BETWEEN b.starts_on AND b.ends_on)
     OR NOT v_in_season THEN
    RETURN;
  END IF;

  SELECT jsonb_array_length(v_lines), coalesce(sum((l->'priced'->>'unitPriceRs')::integer * (l->>'quantity')::integer), 0)
    INTO v_orderable, v_items_total
    FROM jsonb_array_elements(v_lines) l;
  v_fee := CASE WHEN v_order->>'fulfilment' = 'delivery' THEN v_settings.delivery_fee_rs ELSE 0 END;
  IF v_orderable = 0 OR v_items_total + v_fee <> (v_order->>'displayedTotalRs')::integer THEN
    RETURN;
  END IF;

  BEGIN
    -- 0019 (E-11 S-212): a signed-in customer's order goes on their own row, whatever email was
    -- typed (the server passes the id from the session; it must be a linked account row).
    IF nullif(v_order->>'accountCustomerId', '') IS NOT NULL THEN
      SELECT c.id INTO v_customer FROM customer c WHERE c.id = (v_order->>'accountCustomerId')::uuid AND c.auth_user_id IS NOT NULL;
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

    INSERT INTO orders (
      number, source, status, customer_id, contact_name, contact_phone, contact_email, fulfilment, address, landmark,
      fulfil_on, time_window, items_total_rs, delivery_fee_rs, total_rs, customer_note, locale, tracking_token,
      idempotency_key, policies_accepted_at, created_at, updated_at, by_account
    ) VALUES (
      v_number, 'website', 'pending_approval', v_customer, v_order->>'contactName', v_order->>'contactPhone', v_order->>'contactEmail',
      (v_order->>'fulfilment')::fulfilment, v_order->>'address', v_order->>'landmark',
      (v_order->>'fulfilOn')::date, v_window, v_items_total, v_fee, v_items_total + v_fee, v_order->>'customerNote',
      (v_order->>'locale')::locale, v_order->>'trackingToken', v_key, (v_order->>'policiesAcceptedAt')::timestamptz, v_now, v_now,
      coalesce(v_customer = nullif(v_order->>'accountCustomerId', '')::uuid, false)
    ) RETURNING id INTO v_order_id;

    -- FR-012: names, options, prices and the line total are copied; later menu edits never touch them.
    -- FR-017 (0012): the applied promotion (id and title) and the sale base price are copied too.
    INSERT INTO order_item (order_id, product_id, name_en, name_fr, original_base_price_rs, unit_base_price_rs, promotion_id, promotion_title_en,
                            options, cake_message, quantity, line_total_rs, sort_order)
      SELECT v_order_id, p.id, p.name_en, p.name_fr, p.base_price_rs,
             coalesce((l.value->'promo'->>'salePriceRs')::integer, p.base_price_rs),
             (l.value->'promo'->>'promotionId')::uuid, l.value->'promo'->>'titleEn',
             l.value->'priced'->'options', l.value->>'cakeMessage',
             (l.value->>'quantity')::integer, (l.value->'priced'->>'unitPriceRs')::integer * (l.value->>'quantity')::integer,
             (l.ordinality - 1)::smallint
        FROM jsonb_array_elements(v_lines) WITH ORDINALITY AS l(value, ordinality)
        JOIN product p ON p.id = (l.value->>'productId')::uuid;

    INSERT INTO order_event (order_id, actor_type, type, to_status, created_at)
      VALUES (v_order_id, 'customer', 'created', 'pending_approval', v_now);

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
