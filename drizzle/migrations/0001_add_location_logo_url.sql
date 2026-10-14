ALTER TABLE public.stock_locations ADD COLUMN IF NOT EXISTS logo_url text;
COMMENT ON COLUMN public.stock_locations.logo_url IS 'Optional logo image URL shown on the location card and detail page';