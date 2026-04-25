-- Supply stores
CREATE TABLE public.supply_stores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  instagram TEXT,
  address TEXT,
  city TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  notes TEXT,
  default_discount_percent NUMERIC NOT NULL DEFAULT 0,
  default_markup_percent NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.supply_stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view supply stores"
ON public.supply_stores FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can insert supply stores"
ON public.supply_stores FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can update supply stores"
ON public.supply_stores FOR UPDATE
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can delete supply stores"
ON public.supply_stores FOR DELETE
USING (auth.uid() IS NOT NULL);

CREATE TRIGGER update_supply_stores_updated_at
BEFORE UPDATE ON public.supply_stores
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Supply store products (assigned SKUs with optional overrides)
CREATE TABLE public.supply_store_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supply_store_id UUID NOT NULL REFERENCES public.supply_stores(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  discount_percent_override NUMERIC,
  markup_percent_override NUMERIC,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (supply_store_id, product_id)
);

CREATE INDEX idx_supply_store_products_store ON public.supply_store_products(supply_store_id);
CREATE INDEX idx_supply_store_products_product ON public.supply_store_products(product_id);

ALTER TABLE public.supply_store_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view supply store products"
ON public.supply_store_products FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can insert supply store products"
ON public.supply_store_products FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can update supply store products"
ON public.supply_store_products FOR UPDATE
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can delete supply store products"
ON public.supply_store_products FOR DELETE
USING (auth.uid() IS NOT NULL);

CREATE TRIGGER update_supply_store_products_updated_at
BEFORE UPDATE ON public.supply_store_products
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Company / brand settings (single-row pattern)
CREATE TABLE public.company_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name TEXT NOT NULL DEFAULT 'NÉRA Beauty',
  logo_url TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  website TEXT,
  instagram TEXT,
  address TEXT,
  tagline TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view company settings"
ON public.company_settings FOR SELECT
USING (true);

CREATE POLICY "Authenticated can insert company settings"
ON public.company_settings FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can update company settings"
ON public.company_settings FOR UPDATE
USING (auth.uid() IS NOT NULL);

CREATE TRIGGER update_company_settings_updated_at
BEFORE UPDATE ON public.company_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Seed a single company_settings row so the UI always has one to edit
INSERT INTO public.company_settings (company_name) VALUES ('NÉRA Beauty');