DROP TRIGGER IF EXISTS trg_recalc_product_total_stock ON public.product_stock;
CREATE TRIGGER trg_recalc_product_total_stock
AFTER INSERT OR UPDATE OR DELETE ON public.product_stock
FOR EACH ROW
EXECUTE FUNCTION public.recalc_product_total_stock();

DROP TRIGGER IF EXISTS trg_sync_stock_on_hand_to_default_location ON public.products;
CREATE TRIGGER trg_sync_stock_on_hand_to_default_location
AFTER UPDATE OF stock_on_hand ON public.products
FOR EACH ROW
WHEN (pg_trigger_depth() = 0)
EXECUTE FUNCTION public.sync_stock_on_hand_to_default_location();

UPDATE public.products p
SET stock_on_hand = COALESCE(s.total_quantity, 0),
    updated_at = now()
FROM (
  SELECT product_id, SUM(quantity)::integer AS total_quantity
  FROM public.product_stock
  GROUP BY product_id
) s
WHERE p.id = s.product_id;

UPDATE public.products p
SET stock_on_hand = 0,
    updated_at = now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_stock ps WHERE ps.product_id = p.id
);