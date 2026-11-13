-- Options in the place_order price check (S-081, S-092, S-084 AC7). Additive and forward-only:
-- a new function and the 0009 procedure body (date rules, kept unchanged) with options added;
-- no table change; refusal codes are unchanged (the application still decides them from the
-- snapshot). Rollback: a later migration restores the 0009 body and drops order_line_price;
-- orders already placed keep their snapshots.
--
-- Changes to the 0009 body: the snapshot adds Settings `cakeMessageMax` and each product's
-- `minQuantity` and option groups; orderable lines are those whose product is available, in
-- its season TODAY (S-084 AC7: a line whose season ended is left out, like domain/pricing
-- productProblem with today) and whose selection prices (order_line_price); notice and the
-- seasonal date rule are judged on those lines only (as domain/availability is, on the lines
-- domain/pricing leaves in); the total and the items use the priced lines, and each item
-- keeps its options (FR-012).
--
-- order_line_price prices ONE basket line against the catalogue the way domain/pricing.ts
-- priceLine does (base + chosen options; a quantity group adds unit delta x picked quantity;
-- text adds nothing), or returns NULL when the selection is not valid for the product now
-- (unknown or foreign choice, duplicate, too many, quantity out of range, a required group
-- missing, text or cake message over its limit, below the product minimum, line below Rs 0).
-- Such a line is left out like a sold-out one (ADR-0004; PricedLine.problem "options_changed").
-- Text lengths are grapheme clusters: SQL cannot count those, so the application (never the
-- client) passes `textLength` / `cakeMessageLength` it computed with domain/pricing
-- graphemeLength on the same cleaned text it passes.
CREATE FUNCTION "public"."order_line_price"(p_line jsonb, p_product_id uuid, p_base integer, p_min_quantity integer, p_cake_max integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_qty integer;
  v_pick jsonb;
  v_group option_group%ROWTYPE;
  v_choice option_choice%ROWTYPE;
  v_ids text[];
  v_count integer;
  v_known integer;
  v_pick_qty integer;
  v_text text;
  v_deltas integer := 0;
  v_options jsonb := '[]'::jsonb;
  v_seen uuid[] := '{}';
BEGIN
  IF coalesce(p_line->>'quantity', '') !~ '^[0-9]{1,2}$' THEN
    RETURN NULL;
  END IF;
  v_qty := (p_line->>'quantity')::integer;
  IF v_qty < greatest(1, coalesce(p_min_quantity, 1)) OR v_qty > 50 THEN
    RETURN NULL;
  END IF;

  FOR v_pick IN SELECT value FROM jsonb_array_elements(coalesce(p_line->'options', '[]'::jsonb)) LOOP
    SELECT * INTO v_group FROM option_group g WHERE g.id::text = v_pick->>'groupId' AND g.product_id = p_product_id;
    IF NOT FOUND OR v_group.id = ANY(v_seen) THEN
      RETURN NULL;
    END IF;
    v_seen := v_seen || v_group.id;
    v_ids := ARRAY(SELECT jsonb_array_elements_text(coalesce(v_pick->'choiceIds', '[]'::jsonb)));
    v_count := cardinality(v_ids);
    IF (SELECT count(DISTINCT x) FROM unnest(v_ids) x) <> v_count THEN
      RETURN NULL;
    END IF;
    SELECT count(*) INTO v_known FROM option_choice c WHERE c.group_id = v_group.id AND c.id::text = ANY(v_ids);
    IF v_known <> v_count THEN
      RETURN NULL;
    END IF;

    IF v_group.kind = 'text' THEN
      IF v_count > 0 THEN
        RETURN NULL;
      END IF;
      v_text := nullif(v_pick->>'text', '');
      IF v_text IS NULL THEN
        IF v_group.required THEN
          RETURN NULL;
        END IF;
      ELSE
        IF coalesce(v_pick->>'textLength', '') !~ '^[0-9]{1,4}$'
           OR (v_pick->>'textLength')::integer > coalesce(v_group.text_max_length, p_cake_max) THEN
          RETURN NULL;
        END IF;
        v_options := v_options || jsonb_build_array(jsonb_build_object(
          'groupId', v_group.id, 'group', jsonb_strip_nulls(jsonb_build_object('en', v_group.name_en, 'fr', v_group.name_fr)),
          'kind', 'text', 'priceDeltaRs', 0, 'text', v_text));
      END IF;

    ELSIF v_group.kind = 'quantity' THEN
      IF v_count > 1 THEN
        RETURN NULL;
      END IF;
      v_pick_qty := CASE WHEN coalesce(v_pick->>'quantity', '0') ~ '^[0-9]{1,2}$' THEN coalesce((v_pick->>'quantity')::integer, 0) ELSE -1 END;
      IF v_pick_qty < 0
         OR ((v_pick_qty <> 0 OR v_group.required)
             AND (v_pick_qty < coalesce(v_group.quantity_min, 0) OR v_pick_qty > coalesce(v_group.quantity_max, 99))) THEN
        RETURN NULL;
      END IF;
      IF v_count = 1 THEN
        SELECT * INTO v_choice FROM option_choice c WHERE c.group_id = v_group.id AND c.id::text = v_ids[1];
      ELSE
        -- No choice named: the group's only choice, if it has exactly one.
        SELECT * INTO v_choice FROM option_choice c
          WHERE c.group_id = v_group.id AND (SELECT count(*) FROM option_choice o WHERE o.group_id = v_group.id) = 1;
      END IF;
      IF v_pick_qty > 0 THEN
        IF v_choice.id IS NULL THEN
          RETURN NULL;
        END IF;
        v_deltas := v_deltas + v_choice.price_delta_rs * v_pick_qty;
        v_options := v_options || jsonb_build_array(jsonb_build_object(
          'groupId', v_group.id, 'group', jsonb_strip_nulls(jsonb_build_object('en', v_group.name_en, 'fr', v_group.name_fr)),
          'kind', 'quantity', 'choiceId', v_choice.id, 'choice', jsonb_strip_nulls(jsonb_build_object('en', v_choice.name_en, 'fr', v_choice.name_fr)),
          'priceDeltaRs', v_choice.price_delta_rs, 'quantity', v_pick_qty));
      ELSIF v_group.required THEN
        RETURN NULL;
      END IF;

    ELSE
      -- single / multiple
      IF (v_group.kind = 'single' AND v_count > 1) OR (v_count = 0 AND v_group.required) THEN
        RETURN NULL;
      END IF;
      FOR v_choice IN SELECT * FROM option_choice c WHERE c.group_id = v_group.id AND c.id::text = ANY(v_ids) ORDER BY c.sort_order, c.id LOOP
        v_deltas := v_deltas + v_choice.price_delta_rs;
        v_options := v_options || jsonb_build_array(jsonb_build_object(
          'groupId', v_group.id, 'group', jsonb_strip_nulls(jsonb_build_object('en', v_group.name_en, 'fr', v_group.name_fr)),
          'kind', v_group.kind, 'choiceId', v_choice.id, 'choice', jsonb_strip_nulls(jsonb_build_object('en', v_choice.name_en, 'fr', v_choice.name_fr)),
          'priceDeltaRs', v_choice.price_delta_rs));
      END LOOP;
    END IF;
  END LOOP;

  IF EXISTS (SELECT FROM option_group g WHERE g.product_id = p_product_id AND g.required AND NOT (g.id = ANY(v_seen))) THEN
    RETURN NULL;
  END IF;
  IF nullif(p_line->>'cakeMessage', '') IS NOT NULL
     AND (coalesce(p_line->>'cakeMessageLength', '') !~ '^[0-9]{1,4}$' OR (p_line->>'cakeMessageLength')::integer > p_cake_max) THEN
    RETURN NULL;
  END IF;
  IF p_base + v_deltas < 0 THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object('unitPriceRs', p_base + v_deltas, 'options', v_options);
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."order_line_price"(jsonb, uuid, integer, integer, integer) FROM PUBLIC;--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON FUNCTION "public"."order_line_price"(jsonb, uuid, integer, integer, integer) FROM anon; END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON FUNCTION "public"."order_line_price"(jsonb, uuid, integer, integer, integer) FROM authenticated; END IF;
END $$;--> statement-breakpoint
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
    'juiceNumber', v_settings.juice_number,
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
  -- its options (order_line_price).
  SELECT coalesce(jsonb_agg(jsonb_build_object('productId', p.id, 'quantity', (line.value->>'quantity')::integer,
           'cakeMessage', nullif(line.value->>'cakeMessage', ''), 'priced', x.priced) ORDER BY line.ordinality), '[]'::jsonb)
    INTO v_lines
    FROM jsonb_array_elements(v_basket) WITH ORDINALITY AS line(value, ordinality)
    JOIN product p ON p.id = (line.value->>'productId')::uuid AND p.status = 'available'
      AND (p.seasonal_starts_on IS NULL OR v_today BETWEEN p.seasonal_starts_on AND p.seasonal_ends_on)
    CROSS JOIN LATERAL (SELECT order_line_price(line.value, p.id, p.base_price_rs, p.min_quantity, v_settings.cake_message_max) AS priced) x
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

    -- FR-012: names, options, prices and the line total are copied; later menu edits never touch them.
    INSERT INTO order_item (order_id, product_id, name_en, name_fr, original_base_price_rs, unit_base_price_rs, options, cake_message, quantity, line_total_rs, sort_order)
      SELECT v_order_id, p.id, p.name_en, p.name_fr, p.base_price_rs, p.base_price_rs, l.value->'priced'->'options', l.value->>'cakeMessage',
             (l.value->>'quantity')::integer, (l.value->'priced'->>'unitPriceRs')::integer * (l.value->>'quantity')::integer,
             (l.ordinality - 1)::smallint
        FROM jsonb_array_elements(v_lines) WITH ORDINALITY AS l(value, ordinality)
        JOIN product p ON p.id = (l.value->>'productId')::uuid;

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
