
-- Create referrers table
CREATE TABLE public.referrers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  referral_code TEXT NOT NULL UNIQUE,
  commission_rate NUMERIC NOT NULL DEFAULT 10,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  linked_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  total_referred INTEGER NOT NULL DEFAULT 0,
  total_revenue NUMERIC NOT NULL DEFAULT 0,
  total_commission NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.referrers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view referrers"
  ON public.referrers FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert referrers"
  ON public.referrers FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update referrers"
  ON public.referrers FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete referrers"
  ON public.referrers FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- Trigger for updated_at
CREATE TRIGGER update_referrers_updated_at
  BEFORE UPDATE ON public.referrers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Index for fast referral code lookup
CREATE INDEX idx_referrers_referral_code ON public.referrers (referral_code);
CREATE INDEX idx_referrers_status ON public.referrers (status);
CREATE INDEX idx_referrers_linked_profile ON public.referrers (linked_profile_id) WHERE linked_profile_id IS NOT NULL;

-- Create customer_referrals table (lifetime link between customer and referrer)
CREATE TABLE public.customer_referrals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referrer_id UUID NOT NULL REFERENCES public.referrers(id) ON DELETE CASCADE,
  referral_code_used TEXT NOT NULL,
  referred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (customer_id)
);

ALTER TABLE public.customer_referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view customer referrals"
  ON public.customer_referrals FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert customer referrals"
  ON public.customer_referrals FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update customer referrals"
  ON public.customer_referrals FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete customer referrals"
  ON public.customer_referrals FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- Also allow anon inserts for customer app signups
CREATE POLICY "Anon can insert customer referrals"
  ON public.customer_referrals FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE INDEX idx_customer_referrals_customer ON public.customer_referrals (customer_id);
CREATE INDEX idx_customer_referrals_referrer ON public.customer_referrals (referrer_id);

-- Create referral_commissions table
CREATE TABLE public.referral_commissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  referrer_id UUID NOT NULL REFERENCES public.referrers(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  order_subtotal NUMERIC NOT NULL DEFAULT 0,
  commission_rate NUMERIC NOT NULL DEFAULT 10,
  commission_amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  paid_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (order_id)
);

ALTER TABLE public.referral_commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view commissions"
  ON public.referral_commissions FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert commissions"
  ON public.referral_commissions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update commissions"
  ON public.referral_commissions FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete commissions"
  ON public.referral_commissions FOR DELETE
  USING (auth.uid() IS NOT NULL);

CREATE TRIGGER update_referral_commissions_updated_at
  BEFORE UPDATE ON public.referral_commissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_referral_commissions_referrer ON public.referral_commissions (referrer_id);
CREATE INDEX idx_referral_commissions_customer ON public.referral_commissions (customer_id);
CREATE INDEX idx_referral_commissions_status ON public.referral_commissions (status);
CREATE INDEX idx_referral_commissions_created ON public.referral_commissions (created_at);

-- Allow public read of referrers for customer app to validate referral codes
CREATE POLICY "Anyone can check referral codes"
  ON public.referrers FOR SELECT
  TO anon
  USING (status = 'active');
