CREATE TABLE public.bulk_product_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  discount_percent numeric NOT NULL CHECK (discount_percent > 0 AND discount_percent < 100),
  categories text[],
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

GRANT SELECT ON public.bulk_product_sales TO authenticated;
GRANT ALL ON public.bulk_product_sales TO service_role;
ALTER TABLE public.bulk_product_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners can view bulk product sales"
ON public.bulk_product_sales FOR SELECT TO authenticated
USING (public.is_manager());

CREATE TABLE public.bulk_product_sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.bulk_product_sales(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  original_price numeric NOT NULL,
  sale_price numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sale_id, product_id)
);

GRANT SELECT ON public.bulk_product_sale_items TO authenticated;
GRANT ALL ON public.bulk_product_sale_items TO service_role;
ALTER TABLE public.bulk_product_sale_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners can view bulk product sale items"
ON public.bulk_product_sale_items FOR SELECT TO authenticated
USING (public.is_manager());

CREATE OR REPLACE FUNCTION public.apply_bulk_product_discount(
  p_name text,
  p_discount_percent numeric,
  p_categories text[] DEFAULT NULL
)
RETURNS TABLE(sale_id uuid, product_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id uuid;
  v_count integer;
BEGIN
  IF NOT public.is_manager() THEN
    RAISE EXCEPTION 'Only the Owner can apply bulk discounts';
  END IF;
  IF p_discount_percent <= 0 OR p_discount_percent >= 100 THEN
    RAISE EXCEPTION 'Discount must be greater than 0 and less than 100';
  END IF;

  -- Lock every target before checking active sales, preventing overlapping sales
  -- from changing the same product at the same time.
  PERFORM p.id
  FROM public.products p
  WHERE p.category <> 'NÉRA x OhLaLa'
    AND (p_categories IS NULL OR cardinality(p_categories) = 0 OR p.category = ANY(p_categories))
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.products p
    JOIN public.bulk_product_sale_items i ON i.product_id = p.id
    JOIN public.bulk_product_sales s ON s.id = i.sale_id AND s.status = 'active'
    WHERE p.category <> 'NÉRA x OhLaLa'
      AND (p_categories IS NULL OR cardinality(p_categories) = 0 OR p.category = ANY(p_categories))
  ) THEN
    RAISE EXCEPTION 'Some selected products are already in an active sale. End that sale first.';
  END IF;

  INSERT INTO public.bulk_product_sales (name, discount_percent, categories, created_by)
  VALUES (NULLIF(trim(p_name), ''), p_discount_percent, NULLIF(p_categories, '{}'), auth.uid())
  RETURNING id INTO v_sale_id;

  INSERT INTO public.bulk_product_sale_items (sale_id, product_id, original_price, sale_price)
  SELECT v_sale_id, p.id, p.price_usd, round(p.price_usd * (1 - p_discount_percent / 100), 2)
  FROM public.products p
  WHERE p.category <> 'NÉRA x OhLaLa'
    AND (p_categories IS NULL OR cardinality(p_categories) = 0 OR p.category = ANY(p_categories));

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'No eligible products found for this discount';
  END IF;

  UPDATE public.products p
  SET price_usd = i.sale_price, updated_at = now()
  FROM public.bulk_product_sale_items i
  WHERE i.sale_id = v_sale_id AND i.product_id = p.id;

  RETURN QUERY SELECT v_sale_id, v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.end_bulk_product_discount(p_sale_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restored integer;
BEGIN
  IF NOT public.is_manager() THEN
    RAISE EXCEPTION 'Only the Owner can end bulk discounts';
  END IF;

  PERFORM id FROM public.bulk_product_sales WHERE id = p_sale_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This sale is already ended or does not exist';
  END IF;

  UPDATE public.products p
  SET price_usd = i.original_price, updated_at = now()
  FROM public.bulk_product_sale_items i
  WHERE i.sale_id = p_sale_id
    AND i.product_id = p.id
    AND p.price_usd = i.sale_price;

  GET DIAGNOSTICS v_restored = ROW_COUNT;
  UPDATE public.bulk_product_sales SET status = 'ended', ended_at = now() WHERE id = p_sale_id;
  RETURN v_restored;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_bulk_product_discount(text, numeric, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_bulk_product_discount(text, numeric, text[]) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.end_bulk_product_discount(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.end_bulk_product_discount(uuid) TO authenticated, service_role;
