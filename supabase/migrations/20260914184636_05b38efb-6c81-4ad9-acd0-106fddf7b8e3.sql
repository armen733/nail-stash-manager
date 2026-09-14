ALTER TABLE public.discount_codes
  ADD COLUMN IF NOT EXISTS single_account_only boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked_user_id uuid;

CREATE OR REPLACE FUNCTION public.validate_discount_code(p_code text, p_user_id uuid DEFAULT NULL::uuid, p_order_amount numeric DEFAULT NULL::numeric)
RETURNS TABLE(is_valid boolean, code_id uuid, code text, discount_percent integer, one_per_user boolean, already_used boolean, reason text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.discount_codes%ROWTYPE;
  used BOOLEAN := false;
BEGIN
  SELECT * INTO c FROM public.discount_codes
  WHERE lower(discount_codes.code) = lower(trim(p_code)) LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, trim(p_code), NULL::int, NULL::boolean, false, 'Code not found';
    RETURN;
  END IF;

  IF p_user_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.discount_code_redemptions r
      WHERE r.code_id = c.id AND r.user_id = p_user_id
    ) INTO used;
  END IF;

  IF NOT COALESCE(c.is_active, false) THEN
    RETURN QUERY SELECT false, c.id, c.code, c.discount_percent, c.one_per_user, used, 'Code is inactive';
  ELSIF c.valid_from IS NOT NULL AND now() < c.valid_from THEN
    RETURN QUERY SELECT false, c.id, c.code, c.discount_percent, c.one_per_user, used, 'Code is not active yet';
  ELSIF c.valid_until IS NOT NULL AND now() > c.valid_until THEN
    RETURN QUERY SELECT false, c.id, c.code, c.discount_percent, c.one_per_user, used, 'Code has expired';
  ELSIF c.max_uses IS NOT NULL AND COALESCE(c.current_uses, 0) >= c.max_uses THEN
    RETURN QUERY SELECT false, c.id, c.code, c.discount_percent, c.one_per_user, used, 'Code usage limit reached';
  ELSIF COALESCE(c.single_account_only, false) AND p_user_id IS NULL THEN
    RETURN QUERY SELECT false, c.id, c.code, c.discount_percent, c.one_per_user, used, 'Sign in to use this code';
  ELSIF COALESCE(c.single_account_only, false) AND c.locked_user_id IS NOT NULL AND c.locked_user_id <> p_user_id THEN
    RETURN QUERY SELECT false, c.id, c.code, c.discount_percent, c.one_per_user, used, 'This code is reserved for another account';
  ELSIF c.min_order_amount IS NOT NULL AND p_order_amount IS NOT NULL AND p_order_amount < c.min_order_amount THEN
    RETURN QUERY SELECT false, c.id, c.code, c.discount_percent, c.one_per_user, used,
      'Minimum order of $' || c.min_order_amount::text || ' required';
  ELSIF COALESCE(c.one_per_user, true) AND used THEN
    RETURN QUERY SELECT false, c.id, c.code, c.discount_percent, c.one_per_user, used, 'You have already used this code';
  ELSE
    RETURN QUERY SELECT true, c.id, c.code, c.discount_percent, c.one_per_user, used, NULL::text;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_discount_code(p_code text, p_user_id uuid, p_order_id uuid DEFAULT NULL::uuid, p_order_amount numeric DEFAULT NULL::numeric)
RETURNS TABLE(success boolean, discount_percent integer, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_valid BOOLEAN;
  v_code_id UUID;
  v_code TEXT;
  v_percent INTEGER;
  v_one_per_user BOOLEAN;
  v_already_used BOOLEAN;
  v_reason TEXT;
  v_inserted INTEGER;
  v_single BOOLEAN;
  v_locked UUID;
BEGIN
  SELECT t.is_valid, t.code_id, t.code, t.discount_percent, t.one_per_user, t.already_used, t.reason
  INTO v_is_valid, v_code_id, v_code, v_percent, v_one_per_user, v_already_used, v_reason
  FROM public.validate_discount_code(p_code, p_user_id, p_order_amount) t;

  IF NOT COALESCE(v_is_valid, false) THEN
    RETURN QUERY SELECT false, v_percent, COALESCE(v_reason, 'Code not valid');
    RETURN;
  END IF;

  SELECT single_account_only, locked_user_id INTO v_single, v_locked
  FROM public.discount_codes WHERE id = v_code_id FOR UPDATE;

  IF COALESCE(v_single, false) THEN
    IF p_user_id IS NULL THEN
      RETURN QUERY SELECT false, v_percent, 'Sign in to use this code';
      RETURN;
    END IF;
    IF v_locked IS NOT NULL AND v_locked <> p_user_id THEN
      RETURN QUERY SELECT false, v_percent, 'This code is reserved for another account';
      RETURN;
    END IF;
    IF v_locked IS NULL THEN
      UPDATE public.discount_codes SET locked_user_id = p_user_id WHERE id = v_code_id;
    END IF;
  END IF;

  INSERT INTO public.discount_code_redemptions (code_id, code, user_id, order_id)
  VALUES (v_code_id, v_code, p_user_id, p_order_id)
  ON CONFLICT (code_id, user_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 AND COALESCE(v_one_per_user, true) THEN
    RETURN QUERY SELECT false, v_percent, 'You have already used this code';
    RETURN;
  END IF;

  UPDATE public.discount_codes
  SET current_uses = COALESCE(current_uses, 0) + 1
  WHERE id = v_code_id;

  RETURN QUERY SELECT true, v_percent, NULL::text;
END;
$$;