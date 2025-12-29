-- Create discount_codes table
CREATE TABLE public.discount_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  discount_percent INTEGER NOT NULL CHECK (discount_percent > 0 AND discount_percent <= 100),
  valid_from TIMESTAMPTZ DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  max_uses INTEGER,
  current_uses INTEGER DEFAULT 0,
  min_order_amount DECIMAL(10,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on discount_codes
ALTER TABLE public.discount_codes ENABLE ROW LEVEL SECURITY;

-- Anyone can read active discount codes (for validation)
CREATE POLICY "Anyone can read active discount codes" ON public.discount_codes 
FOR SELECT USING (is_active = true);

-- Authenticated users can manage discount codes (admin functionality)
CREATE POLICY "Authenticated users can manage discount codes" ON public.discount_codes 
FOR ALL USING (auth.uid() IS NOT NULL);

-- Create loyalty_transactions table
CREATE TABLE public.loyalty_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  points INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('earned', 'redeemed')),
  order_id UUID REFERENCES public.orders(id),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on loyalty_transactions
ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;

-- Users can view their own transactions
CREATE POLICY "Users can view own loyalty transactions" ON public.loyalty_transactions 
FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own transactions
CREATE POLICY "Users can insert own loyalty transactions" ON public.loyalty_transactions 
FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Authenticated staff can view all transactions
CREATE POLICY "Staff can view all loyalty transactions" ON public.loyalty_transactions 
FOR SELECT USING (auth.uid() IS NOT NULL);

-- Add loyalty_points column to profiles table
ALTER TABLE public.profiles ADD COLUMN loyalty_points INTEGER DEFAULT 0;