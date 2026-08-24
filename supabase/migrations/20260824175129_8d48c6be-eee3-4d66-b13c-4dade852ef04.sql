ALTER TABLE public.discount_codes
  ADD COLUMN IF NOT EXISTS one_per_user BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.discount_code_redemptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code_id UUID NOT NULL REFERENCES public.discount_codes(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  user_id UUID NOT NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS discount_code_redemptions_code_user_uidx
  ON public.discount_code_redemptions (code_id, user_id);

GRANT SELECT ON public.discount_code_redemptions TO authenticated;
GRANT ALL ON public.discount_code_redemptions TO service_role;

ALTER TABLE public.discount_code_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own redemptions"
ON public.discount_code_redemptions FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Staff can view all redemptions"
ON public.discount_code_redemptions FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.id = auth.uid() AND p.role IN ('Owner','Sales Rep')
));

CREATE OR REPLACE FUNCTION public.validate_discount_code(
  p_code TEXT,
  p_user_id UUID DEFAULT NULL,
  p_order_amount NUMERIC DEFAULT NULL
)
RETURNS TABLE(
  is_valid BOOLEAN,
  code_id UUID,
  code TEXT,
  discount_percent INTEGER,
  one_per_user BOOLEAN,
  already_used BOOLEAN,
  reason TEXT
)
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

CREATE OR REPLACE FUNCTION public.redeem_discount_code(
  p_code TEXT,
  p_user_id UUID,
  p_order_id UUID DEFAULT NULL,
  p_order_amount NUMERIC DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, discount_percent INTEGER, reason TEXT)
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
BEGIN
  SELECT t.is_valid, t.code_id, t.code, t.discount_percent, t.one_per_user, t.already_used, t.reason
  INTO v_is_valid, v_code_id, v_code, v_percent, v_one_per_user, v_already_used, v_reason
  FROM public.validate_discount_code(p_code, p_user_id, p_order_amount) t;

  IF NOT COALESCE(v_is_valid, false) THEN
    RETURN QUERY SELECT false, v_percent, COALESCE(v_reason, 'Code not valid');
    RETURN;
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

GRANT EXECUTE ON FUNCTION public.validate_discount_code(TEXT, UUID, NUMERIC) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.redeem_discount_code(TEXT, UUID, UUID, NUMERIC) TO authenticated, service_role;