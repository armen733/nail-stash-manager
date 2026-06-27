
-- 1) Backfill: for every product whose stock_on_hand differs from SUM(product_stock),
--    adjust the default warehouse row by the delta so totals match.
DO $$
DECLARE
  default_loc UUID;
BEGIN
  SELECT id INTO default_loc FROM public.stock_locations WHERE is_default = true LIMIT 1;
  IF default_loc IS NULL THEN RETURN; END IF;

  INSERT INTO public.product_stock (product_id, location_id, quantity)
  SELECT p.id, default_loc,
         COALESCE(p.stock_on_hand, 0) - COALESCE(s.total, 0)
  FROM public.products p
  LEFT JOIN (
    SELECT product_id, SUM(quantity) AS total
    FROM public.product_stock
    GROUP BY product_id
  ) s ON s.product_id = p.id
  WHERE COALESCE(p.stock_on_hand, 0) <> COALESCE(s.total, 0)
  ON CONFLICT (product_id, location_id)
  DO UPDATE SET quantity = public.product_stock.quantity +
    (COALESCE((SELECT stock_on_hand FROM public.products WHERE id = EXCLUDED.product_id), 0)
     - COALESCE((SELECT SUM(quantity) FROM public.product_stock WHERE product_id = EXCLUDED.product_id), 0)),
    updated_at = now();
END $$;

-- 2) Trigger: when products.stock_on_hand changes and no longer matches SUM(product_stock),
--    push the delta into the default location row. The existing recalc trigger on
--    product_stock will then update products.stock_on_hand to the new SUM (= user value),
--    which won't re-fire this trigger (delta becomes 0).
CREATE OR REPLACE FUNCTION public.sync_stock_on_hand_to_default_location()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  default_loc UUID;
  current_sum INTEGER;
  delta INTEGER;
BEGIN
  IF NEW.stock_on_hand IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.stock_on_hand IS NOT DISTINCT FROM OLD.stock_on_hand THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO current_sum
  FROM public.product_stock WHERE product_id = NEW.id;

  delta := COALESCE(NEW.stock_on_hand, 0) - current_sum;
  IF delta = 0 THEN RETURN NEW; END IF;

  SELECT id INTO default_loc FROM public.stock_locations WHERE is_default = true LIMIT 1;
  IF default_loc IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.product_stock (product_id, location_id, quantity)
  VALUES (NEW.id, default_loc, delta)
  ON CONFLICT (product_id, location_id)
  DO UPDATE SET quantity = public.product_stock.quantity + delta,
                updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_stock_on_hand_to_default_location ON public.products;
CREATE TRIGGER sync_stock_on_hand_to_default_location
AFTER INSERT OR UPDATE OF stock_on_hand ON public.products
FOR EACH ROW EXECUTE FUNCTION public.sync_stock_on_hand_to_default_location();
