ALTER TABLE public.stock_locations
ADD COLUMN supply_store_id UUID REFERENCES public.supply_stores(id) ON DELETE SET NULL;

CREATE INDEX idx_stock_locations_supply_store ON public.stock_locations(supply_store_id);