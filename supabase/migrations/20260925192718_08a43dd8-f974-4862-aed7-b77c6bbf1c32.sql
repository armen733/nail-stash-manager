CREATE TABLE public.shipping_settings (
  id uuid primary key default gen_random_uuid(),
  from_name text not null default 'NÉRA Beauty',
  from_street1 text not null default '',
  from_city text not null default '',
  from_state text not null default '',
  from_zip text not null default '',
  from_phone text not null default '',
  from_email text not null default '',
  default_weight_oz numeric not null default 8,
  default_length_in numeric not null default 9,
  default_width_in numeric not null default 6,
  default_height_in numeric not null default 2,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shipping_settings TO authenticated;
GRANT ALL ON public.shipping_settings TO service_role;
ALTER TABLE public.shipping_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read shipping settings" ON public.shipping_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Managers can manage shipping settings" ON public.shipping_settings FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Owner','Sales Rep'))) WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Owner','Sales Rep')));
INSERT INTO public.shipping_settings (from_name, from_phone, from_email) VALUES ('NÉRA Beauty', '+1 (213) 563-10-90', 'info@nerabeautyus.com');