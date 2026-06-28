
CREATE OR REPLACE FUNCTION public.process_referral_on_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer public.referrers%ROWTYPE;
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

  -- Skip if commission already exists for this order
  IF EXISTS (SELECT 1 FROM public.referral_commissions WHERE order_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Need a customer to attribute
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Link customer to referrer (first-touch attribution)
  INSERT INTO public.customer_referrals (customer_id, referrer_id, referral_code_used)
  VALUES (NEW.user_id, v_referrer.id, NEW.discount_code)
  ON CONFLICT (customer_id) DO NOTHING;

  v_subtotal := COALESCE(NEW.subtotal, NEW.total, 0);
  v_commission := ROUND(v_subtotal * v_referrer.commission_rate / 100.0, 2);

  INSERT INTO public.referral_commissions
    (order_id, referrer_id, customer_id, order_subtotal, commission_rate, commission_amount, status)
  VALUES
    (NEW.id, v_referrer.id, NEW.user_id, v_subtotal, v_referrer.commission_rate, v_commission, 'pending');

  UPDATE public.referrers
  SET total_referred = total_referred + 1,
      total_revenue = total_revenue + v_subtotal,
      total_commission = total_commission + v_commission,
      updated_at = now()
  WHERE id = v_referrer.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_process_referral_on_order ON public.orders;
CREATE TRIGGER trg_process_referral_on_order
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.process_referral_on_order();
