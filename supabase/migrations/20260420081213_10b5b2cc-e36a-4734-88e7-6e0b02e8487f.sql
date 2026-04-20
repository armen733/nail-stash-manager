-- Ensure no duplicate (product_id, location_id) rows exist before adding the unique constraint
-- (merge any duplicates by summing quantity & reserved)
WITH dups AS (
  SELECT product_id, location_id,
         SUM(quantity)::int AS total_qty,
         SUM(reserved)::int AS total_res,
         (ARRAY_AGG(id ORDER BY updated_at DESC))[1] AS keep_id
  FROM public.product_stock
  GROUP BY product_id, location_id
  HAVING COUNT(*) > 1
)
UPDATE public.product_stock ps
SET quantity = d.total_qty, reserved = d.total_res, updated_at = now()
FROM dups d
WHERE ps.id = d.keep_id;

DELETE FROM public.product_stock ps
USING (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY product_id, location_id ORDER BY updated_at DESC) AS rn
    FROM public.product_stock
  ) x WHERE rn > 1
) dup
WHERE ps.id = dup.id;

-- Add the unique constraint required by the ON CONFLICT in apply_stock_movement()
ALTER TABLE public.product_stock
  ADD CONSTRAINT product_stock_product_location_unique UNIQUE (product_id, location_id);