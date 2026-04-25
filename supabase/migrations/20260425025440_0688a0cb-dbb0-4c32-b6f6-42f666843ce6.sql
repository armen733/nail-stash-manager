ALTER TABLE public.company_settings
ADD COLUMN IF NOT EXISTS default_supply_store_discount_percent NUMERIC NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS default_supply_store_markup_percent NUMERIC NOT NULL DEFAULT 0;