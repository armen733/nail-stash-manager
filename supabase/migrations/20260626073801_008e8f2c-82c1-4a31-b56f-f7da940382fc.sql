
CREATE TABLE public.business_expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  description TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_expenses TO authenticated;
GRANT ALL ON public.business_expenses TO service_role;

ALTER TABLE public.business_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view expenses"
  ON public.business_expenses FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert expenses"
  ON public.business_expenses FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update expenses"
  ON public.business_expenses FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete expenses"
  ON public.business_expenses FOR DELETE
  TO authenticated USING (true);

CREATE TRIGGER business_expenses_updated_at
  BEFORE UPDATE ON public.business_expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_business_expenses_date ON public.business_expenses(expense_date DESC);
