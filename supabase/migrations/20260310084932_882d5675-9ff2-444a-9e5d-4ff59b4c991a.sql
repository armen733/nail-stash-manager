
CREATE TABLE public.tax_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_rate numeric NOT NULL DEFAULT 0,
  tax_name text NOT NULL DEFAULT 'Sales Tax',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.tax_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view tax settings" ON public.tax_settings FOR SELECT TO public USING (true);
CREATE POLICY "Authenticated users can update tax settings" ON public.tax_settings FOR UPDATE TO public USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can insert tax settings" ON public.tax_settings FOR INSERT TO public WITH CHECK (auth.uid() IS NOT NULL);

-- Insert default row
INSERT INTO public.tax_settings (tax_rate, tax_name) VALUES (8.875, 'Sales Tax');
