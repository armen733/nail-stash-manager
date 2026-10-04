ALTER TABLE public.discount_codes ADD COLUMN referrer_id uuid REFERENCES public.referrers(id) ON DELETE SET NULL;
CREATE INDEX idx_discount_codes_referrer_id ON public.discount_codes(referrer_id);