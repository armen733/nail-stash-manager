
CREATE OR REPLACE FUNCTION public.award_loyalty_points_on_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  per_dollar NUMERIC;
  base_amount NUMERIC;
  pts INTEGER;
BEGIN
  IF NEW.profile_id IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.points_earned, 0) > 0 THEN RETURN NEW; END IF;

  SELECT points_per_dollar INTO per_dollar FROM public.loyalty_settings LIMIT 1;
  per_dollar := COALESCE(per_dollar, 1);

  base_amount := GREATEST(COALESCE(NEW.subtotal, 0) - COALESCE(NEW.discount_amount, 0), 0);
  pts := FLOOR(base_amount * per_dollar)::INTEGER;
  IF pts <= 0 THEN RETURN NEW; END IF;

  NEW.points_earned := pts;

  UPDATE public.profiles
  SET loyalty_points = COALESCE(loyalty_points, 0) + pts
  WHERE id = NEW.profile_id;

  INSERT INTO public.loyalty_transactions (user_id, order_id, points, type, description)
  VALUES (NEW.profile_id, NEW.id, pts, 'earned', 'Earned from order');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_award_loyalty_points_on_order ON public.orders;
CREATE TRIGGER trg_award_loyalty_points_on_order
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.award_loyalty_points_on_order();

DO $$
DECLARE
  per_dollar NUMERIC;
  r RECORD;
  pts INTEGER;
  base_amount NUMERIC;
BEGIN
  SELECT points_per_dollar INTO per_dollar FROM public.loyalty_settings LIMIT 1;
  per_dollar := COALESCE(per_dollar, 1);

  FOR r IN
    SELECT o.id, o.profile_id, o.subtotal, o.discount_amount
    FROM public.orders o
    WHERE o.profile_id IS NOT NULL
      AND COALESCE(o.points_earned, 0) = 0
      AND NOT EXISTS (
        SELECT 1 FROM public.loyalty_transactions lt
        WHERE lt.order_id = o.id AND lt.type = 'earned'
      )
  LOOP
    base_amount := GREATEST(COALESCE(r.subtotal, 0) - COALESCE(r.discount_amount, 0), 0);
    pts := FLOOR(base_amount * per_dollar)::INTEGER;
    IF pts > 0 THEN
      UPDATE public.orders SET points_earned = pts WHERE id = r.id;
      UPDATE public.profiles SET loyalty_points = COALESCE(loyalty_points, 0) + pts WHERE id = r.profile_id;
      INSERT INTO public.loyalty_transactions (user_id, order_id, points, type, description)
      VALUES (r.profile_id, r.id, pts, 'earned', 'Backfilled from order');
    END IF;
  END LOOP;
END $$;
