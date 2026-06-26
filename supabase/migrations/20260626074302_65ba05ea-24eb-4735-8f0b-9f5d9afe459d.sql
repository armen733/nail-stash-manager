
CREATE TABLE public.production_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  sku TEXT,
  product_name TEXT,
  supplier_name TEXT,
  quantity NUMERIC NOT NULL DEFAULT 0,
  amount_spent NUMERIC NOT NULL DEFAULT 0,
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_orders TO authenticated;
GRANT ALL ON public.production_orders TO service_role;

ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view production orders"
  ON public.production_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert production orders"
  ON public.production_orders FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can update production orders"
  ON public.production_orders FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can delete production orders"
  ON public.production_orders FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE TRIGGER production_orders_updated_at
  BEFORE UPDATE ON public.production_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_production_orders_date ON public.production_orders(order_date DESC);
CREATE INDEX idx_production_orders_product ON public.production_orders(product_id);
