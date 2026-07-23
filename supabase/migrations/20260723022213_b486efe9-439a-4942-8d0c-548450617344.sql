
CREATE OR REPLACE FUNCTION public.deduct_loyalty_points_on_redeem()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  delta INTEGER;
BEGIN
  IF NEW.profile_id IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    delta := COALESCE(NEW.points_redeemed, 0);
  ELSE
    delta := COALESCE(NEW.points_redeemed, 0) - COALESCE(OLD.points_redeemed, 0);
  END IF;

  IF delta <= 0 THEN RETURN NEW; END IF;

  UPDATE public.profiles
  SET loyalty_points = GREATEST(COALESCE(loyalty_points, 0) - delta, 0)
  WHERE id = NEW.profile_id;

  INSERT INTO public.loyalty_transactions (user_id, order_id, points, type, description)
  VALUES (NEW.profile_id, NEW.id, delta, 'redeemed', 'Redeemed on order');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deduct_loyalty_points_on_redeem ON public.orders;
CREATE TRIGGER trg_deduct_loyalty_points_on_redeem
AFTER INSERT OR UPDATE OF points_redeemed ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.deduct_loyalty_points_on_redeem();
