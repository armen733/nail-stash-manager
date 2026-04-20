-- ============================================
-- Round 2: AR + Payments + Loyalty foundations
-- ============================================

-- 1) Extend orders with AR fields
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_due NUMERIC NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS orders_invoice_number_key
  ON public.orders (invoice_number)
  WHERE invoice_number IS NOT NULL;

-- 2) Sequence + auto invoice number for new orders
CREATE SEQUENCE IF NOT EXISTS public.invoice_seq START 1000;

CREATE OR REPLACE FUNCTION public.assign_invoice_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.invoice_number IS NULL THEN
    NEW.invoice_number := 'INV-' || LPAD(nextval('public.invoice_seq')::text, 6, '0');
  END IF;
  -- initialize balance_due if not set
  IF NEW.balance_due IS NULL OR NEW.balance_due = 0 THEN
    NEW.balance_due := COALESCE(NEW.total, 0) - COALESCE(NEW.amount_paid, 0);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_invoice_number ON public.orders;
CREATE TRIGGER trg_assign_invoice_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_invoice_number();

-- backfill invoice numbers for existing orders + recompute balance_due
UPDATE public.orders
SET invoice_number = 'INV-' || LPAD(nextval('public.invoice_seq')::text, 6, '0')
WHERE invoice_number IS NULL;

UPDATE public.orders
SET balance_due = GREATEST(COALESCE(total, 0) - COALESCE(amount_paid, 0), 0);

-- 3) Payments table
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  salon_id UUID REFERENCES public.salons(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL DEFAULT 'cash',
  reference TEXT,
  notes TEXT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payments_order_id_idx ON public.payments(order_id);
CREATE INDEX IF NOT EXISTS payments_salon_id_idx ON public.payments(salon_id);
CREATE INDEX IF NOT EXISTS payments_paid_at_idx ON public.payments(paid_at DESC);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view payments"
  ON public.payments FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can insert payments"
  ON public.payments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can update payments"
  ON public.payments FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can delete payments"
  ON public.payments FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- 4) Recalculate order balance whenever payments change
CREATE OR REPLACE FUNCTION public.recalc_order_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  oid UUID;
  paid_total NUMERIC;
  ord_total NUMERIC;
BEGIN
  oid := COALESCE(NEW.order_id, OLD.order_id);

  SELECT COALESCE(SUM(amount), 0) INTO paid_total
  FROM public.payments WHERE order_id = oid;

  SELECT total INTO ord_total
  FROM public.orders WHERE id = oid;

  UPDATE public.orders
  SET amount_paid = paid_total,
      balance_due = GREATEST(COALESCE(ord_total, 0) - paid_total, 0),
      status = CASE
        WHEN paid_total >= COALESCE(ord_total, 0) AND COALESCE(ord_total, 0) > 0 THEN 'Paid'::order_status
        ELSE status
      END,
      updated_at = now()
  WHERE id = oid;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_recalc_ai ON public.payments;
CREATE TRIGGER trg_payments_recalc_ai
  AFTER INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.recalc_order_balance();

DROP TRIGGER IF EXISTS trg_payments_recalc_au ON public.payments;
CREATE TRIGGER trg_payments_recalc_au
  AFTER UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.recalc_order_balance();

DROP TRIGGER IF EXISTS trg_payments_recalc_ad ON public.payments;
CREATE TRIGGER trg_payments_recalc_ad
  AFTER DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.recalc_order_balance();

-- 5) Recalculate balance when order total changes (e.g. order edits)
CREATE OR REPLACE FUNCTION public.recalc_order_balance_on_total_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.total IS DISTINCT FROM OLD.total THEN
    NEW.balance_due := GREATEST(COALESCE(NEW.total, 0) - COALESCE(NEW.amount_paid, 0), 0);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_total_recalc ON public.orders;
CREATE TRIGGER trg_orders_total_recalc
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.recalc_order_balance_on_total_change();