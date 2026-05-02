ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shipping numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_zone text;