ALTER TABLE public.business_expenses
  ADD COLUMN is_recurring boolean DEFAULT false,
  ADD COLUMN recurring_frequency text DEFAULT 'monthly';

CREATE INDEX IF NOT EXISTS idx_business_expenses_recurring ON public.business_expenses(is_recurring);