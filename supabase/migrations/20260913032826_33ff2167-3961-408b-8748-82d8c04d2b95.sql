-- BEFORE INSERT: only compute points on the row (no child inserts yet)
CREATE OR REPLACE FUNCTION public.award_loyalty_points_on_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  RETURN NEW;
END;
$function$;

-- AFTER INSERT: credit the customer and log the transaction (order row now exists)
CREATE OR REPLACE FUNCTION public.award_loyalty_points_after_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.profile_id IS NULL THEN RETURN NULL; END IF;
  IF COALESCE(NEW.points_earned, 0) <= 0 THEN RETURN NULL; END IF;

  UPDATE public.profiles
  SET loyalty_points = COALESCE(loyalty_points, 0) + NEW.points_earned
  WHERE id = NEW.profile_id;

  INSERT INTO public.loyalty_transactions (user_id, order_id, points, type, description)
  VALUES (NEW.profile_id, NEW.id, NEW.points_earned, 'earned', 'Earned from order');

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_award_loyalty_points_after_order ON public.orders;
CREATE TRIGGER trg_award_loyalty_points_after_order
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.award_loyalty_points_after_order();