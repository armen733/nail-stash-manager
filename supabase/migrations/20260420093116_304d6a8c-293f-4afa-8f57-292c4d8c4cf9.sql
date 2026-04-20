-- Returns header
CREATE TABLE public.returns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL,
  salon_id UUID,
  refund_method TEXT NOT NULL CHECK (refund_method IN ('cash', 'store_credit')),
  refund_amount NUMERIC NOT NULL DEFAULT 0,
  reason TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_returns_order ON public.returns(order_id);
CREATE INDEX idx_returns_salon ON public.returns(salon_id);

ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view returns" ON public.returns
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can insert returns" ON public.returns
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can update returns" ON public.returns
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can delete returns" ON public.returns
  FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- Return line items
CREATE TABLE public.return_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  return_id UUID NOT NULL REFERENCES public.returns(id) ON DELETE CASCADE,
  order_item_id UUID,
  product_id UUID NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC NOT NULL DEFAULT 0,
  line_total NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_return_items_return ON public.return_items(return_id);

ALTER TABLE public.return_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view return items" ON public.return_items
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can insert return items" ON public.return_items
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can update return items" ON public.return_items
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can delete return items" ON public.return_items
  FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- Salon store-credit ledger
CREATE TABLE public.salon_credits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  salon_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  source TEXT NOT NULL DEFAULT 'return' CHECK (source IN ('return', 'manual', 'redemption')),
  reference_id UUID,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_salon_credits_salon ON public.salon_credits(salon_id);

ALTER TABLE public.salon_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view salon credits" ON public.salon_credits
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can insert salon credits" ON public.salon_credits
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can update salon credits" ON public.salon_credits
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can delete salon credits" ON public.salon_credits
  FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- Trigger: when a cash refund return is created, reduce the order's total + amount_paid
CREATE OR REPLACE FUNCTION public.apply_cash_refund_to_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.refund_method = 'cash' AND NEW.refund_amount > 0 THEN
    UPDATE public.orders
    SET total = GREATEST(COALESCE(total, 0) - NEW.refund_amount, 0),
        amount_paid = GREATEST(COALESCE(amount_paid, 0) - NEW.refund_amount, 0),
        updated_at = now()
    WHERE id = NEW.order_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_apply_cash_refund
AFTER INSERT ON public.returns
FOR EACH ROW
EXECUTE FUNCTION public.apply_cash_refund_to_order();