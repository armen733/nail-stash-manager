
-- Backfill: create a product_stock row at the default (Main) warehouse for every product missing one
INSERT INTO public.product_stock (product_id, location_id, quantity)
SELECT p.id, sl.id, COALESCE(p.stock_on_hand, 0)
FROM public.products p
CROSS JOIN LATERAL (
  SELECT id FROM public.stock_locations WHERE is_default = true ORDER BY created_at LIMIT 1
) sl
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_stock ps
  WHERE ps.product_id = p.id AND ps.location_id = sl.id
);

-- Trigger function: auto-create product_stock at default location on new product
CREATE OR REPLACE FUNCTION public.ensure_default_stock_row()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  default_loc uuid;
BEGIN
  SELECT id INTO default_loc FROM public.stock_locations WHERE is_default = true ORDER BY created_at LIMIT 1;
  IF default_loc IS NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.product_stock (product_id, location_id, quantity)
  VALUES (NEW.id, default_loc, COALESCE(NEW.stock_on_hand, 0))
  ON CONFLICT (product_id, location_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_default_stock_row ON public.products;
CREATE TRIGGER trg_ensure_default_stock_row
AFTER INSERT ON public.products
FOR EACH ROW EXECUTE FUNCTION public.ensure_default_stock_row();
