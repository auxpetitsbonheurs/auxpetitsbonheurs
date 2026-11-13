-- RL-order on placeOrder (S-091 AC8; checkout spec pipeline step 3). Additive, hand-written,
-- forward-only. place_order itself is NOT redefined (parallel jobs own its body): this wrapper
-- counts the attempt in rate_limit_bucket (the same atomic upsert as consumeRateLimit), turns
-- the write off when the count is over the limit the application chose, then calls
-- place_order unchanged. The application still makes one round trip per submit
-- (ADR-0003 amendment 3), and the idempotency replay (step 2) still wins over the limit: a
-- key that already belongs to an order is answered by place_order and never counted (S-228 AC2:
-- a double tap, refresh or resend of a placed order uses up nothing).
--
-- p_limit: { key: text (hashed, rateLimitKey), windowStart: timestamptz, max: int, insert: bool }
--   insert = false also when the application refused the bot check (BOT_CHECK_FAILED), so a
--   replay is still answered and nothing new is written.
-- result: place_order's answer plus { attempts: int } (this window's count, this attempt included).
--
-- Rollback: a later migration drops the procedure; the application then calls place_order.
CREATE PROCEDURE "public"."place_order_limited"(p_input jsonb, p_limit jsonb, INOUT result jsonb DEFAULT NULL)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
  v_input jsonb := p_input;
  v_key uuid := nullif(p_input->>'idempotencyKey', '')::uuid;
BEGIN
  IF v_key IS NOT NULL AND EXISTS (SELECT 1 FROM orders WHERE idempotency_key = v_key) THEN
    CALL place_order(v_input, result);
    result := result || jsonb_build_object('attempts', 0);
    RETURN;
  END IF;
  INSERT INTO rate_limit_bucket ("key", window_start, "count")
    VALUES (p_limit->>'key', (p_limit->>'windowStart')::timestamptz, 1)
    ON CONFLICT ("key", window_start) DO UPDATE SET "count" = rate_limit_bucket."count" + 1
    RETURNING "count" INTO v_count;
  IF v_count > (p_limit->>'max')::integer OR coalesce((p_limit->>'insert')::boolean, true) = false THEN
    v_input := jsonb_set(v_input, '{insert}', 'false'::jsonb);
  END IF;
  CALL place_order(v_input, result);
  result := result || jsonb_build_object('attempts', v_count);
END;
$$;
--> statement-breakpoint
REVOKE ALL ON PROCEDURE "public"."place_order_limited"(jsonb, jsonb, jsonb) FROM PUBLIC;--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON PROCEDURE "public"."place_order_limited"(jsonb, jsonb, jsonb) FROM anon; END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON PROCEDURE "public"."place_order_limited"(jsonb, jsonb, jsonb) FROM authenticated; END IF;
END $$;
