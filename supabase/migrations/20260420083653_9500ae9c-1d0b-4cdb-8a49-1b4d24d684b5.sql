CREATE TABLE public.location_product_prices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES public.stock_locations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  price_usd NUMERIC NOT NULL CHECK (price_usd >= 0),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (location_id, product_id)
);

CREATE INDEX idx_lpp_location ON public.location_product_prices(location_id);
CREATE INDEX idx_lpp_product ON public.location_product_prices(product_id);

ALTER TABLE public.location_product_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view location prices"
  ON public.location_product_prices FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can insert location prices"
  ON public.location_product_prices FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can update location prices"
  ON public.location_product_prices FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can delete location prices"
  ON public.location_product_prices FOR DELETE
  USING (auth.uid() IS NOT NULL);

CREATE TRIGGER trg_lpp_updated_at
  BEFORE UPDATE ON public.location_product_prices
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();