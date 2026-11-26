CREATE OR REPLACE FUNCTION public.get_active_bulk_product_discounts()
RETURNS TABLE(
  product_id uuid,
  sale_name text,
  discount_percent numeric,
  original_price numeric,
  sale_price numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.product_id,
    s.name AS sale_name,
    s.discount_percent,
    i.original_price,
    i.sale_price
  FROM public.bulk_product_sale_items i
  JOIN public.bulk_product_sales s ON s.id = i.sale_id
  JOIN public.products p ON p.id = i.product_id
  WHERE s.status = 'active'
    AND p.price_usd = i.sale_price
    AND i.original_price > i.sale_price
    AND p.category <> 'NÉRA x OhLaLa';
$$;

REVOKE ALL ON FUNCTION public.get_active_bulk_product_discounts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_bulk_product_discounts() TO anon, authenticated, service_role;