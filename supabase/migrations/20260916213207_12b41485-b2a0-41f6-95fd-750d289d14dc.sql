CREATE OR REPLACE FUNCTION public.process_referral_on_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer public.referrers%ROWTYPE;
  v_customer uuid;
  v_subtotal NUMERIC;
  v_commission NUMERIC;
BEGIN
  IF NEW.discount_code IS NULL OR NEW.discount_code = '' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_referrer
  FROM public.referrers
  WHERE lower(referral_code) = lower(NEW.discount_code)
    AND status = 'active'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.referral_commissions WHERE order_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  v_customer := NEW.profile_id;
  IF v_customer IS NULL THEN
    RETURN NEW;
  END IF;

  -- Never pay a referrer for their own account's order
  IF v_referrer.linked_profile_id IS NOT NULL AND v_referrer.linked_profile_id = v_customer THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.customer_referrals (customer_id, referrer_id, referral_code_used)
  VALUES (v_customer, v_referrer.id, NEW.discount_code)
  ON CONFLICT (customer_id) DO NOTHING;

  v_subtotal := COALESCE(NEW.subtotal, NEW.total, 0);
  v_commission := ROUND(v_subtotal * v_referrer.commission_rate / 100.0, 2);

  INSERT INTO public.referral_commissions
    (order_id, referrer_id, customer_id, order_subtotal, commission_rate, commission_amount, status)
  VALUES
    (NEW.id, v_referrer.id, v_customer, v_subtotal, v_referrer.commission_rate, v_commission, 'pending');

  UPDATE public.referrers
  SET total_referred = total_referred + 1,
      total_revenue = total_revenue + v_subtotal,
      total_commission = total_commission + v_commission,
      updated_at = now()
  WHERE id = v_referrer.id;

  RETURN NEW;
END;
$$;