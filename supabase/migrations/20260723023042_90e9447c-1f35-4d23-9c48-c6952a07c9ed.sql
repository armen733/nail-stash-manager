
-- Add opt-in flag for auto-redeeming loyalty points at checkout
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS auto_redeem_points BOOLEAN NOT NULL DEFAULT false;

-- Auto-apply max eligible redemption on order INSERT when opted-in
CREATE OR REPLACE FUNCTION public.auto_apply_loyalty_redemption()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.loyalty_settings%ROWTYPE;
  balance INTEGER;
  base_amount NUMERIC;
  max_blocks_by_points INTEGER;
  max_blocks_by_amount INTEGER;
  blocks INTEGER;
  pts_to_use INTEGER;
  discount_to_add NUMERIC;
BEGIN
  IF NOT COALESCE(NEW.auto_redeem_points, false) THEN RETURN NEW; END IF;
  IF NEW.profile_id IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.points_redeemed, 0) > 0 THEN RETURN NEW; END IF;

  SELECT * INTO s FROM public.loyalty_settings LIMIT 1;
  IF s.points_required_for_redemption IS NULL OR s.redemption_value_usd IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(loyalty_points, 0) INTO balance FROM public.profiles WHERE id = NEW.profile_id;
  IF balance < s.points_required_for_redemption THEN RETURN NEW; END IF;

  base_amount := GREATEST(COALESCE(NEW.subtotal, NEW.total, 0) - COALESCE(NEW.discount_amount, 0), 0);
  IF base_amount <= 0 THEN RETURN NEW; END IF;

  max_blocks_by_points := balance / s.points_required_for_redemption;
  max_blocks_by_amount := FLOOR(base_amount / s.redemption_value_usd)::INTEGER;
  blocks := LEAST(max_blocks_by_points, max_blocks_by_amount);
  IF blocks <= 0 THEN RETURN NEW; END IF;

  pts_to_use := blocks * s.points_required_for_redemption;
  discount_to_add := blocks * s.redemption_value_usd;

  NEW.points_redeemed := pts_to_use;
  NEW.discount_amount := COALESCE(NEW.discount_amount, 0) + discount_to_add;
  NEW.total := GREATEST(COALESCE(NEW.total, 0) - discount_to_add, 0);
  NEW.balance_due := GREATEST(COALESCE(NEW.total, 0) - COALESCE(NEW.amount_paid, 0), 0);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_apply_loyalty_redemption ON public.orders;
CREATE TRIGGER trg_auto_apply_loyalty_redemption
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_apply_loyalty_redemption();
