-- Create user_tiers table
CREATE TABLE user_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL,
  current_tier TEXT DEFAULT 'none' CHECK (current_tier IN ('none', 'bronze', 'silver', 'gold')),
  tier_discount_percent INTEGER DEFAULT 0,
  monthly_spend DECIMAL(10,2) DEFAULT 0,
  spend_month DATE DEFAULT date_trunc('month', NOW()),
  tier_valid_until DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE user_tiers ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_tiers
CREATE POLICY "Users can view own tier" ON user_tiers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own tier" ON user_tiers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own tier" ON user_tiers FOR UPDATE USING (auth.uid() = user_id);

-- Staff can view all tiers (for admin purposes)
CREATE POLICY "Staff can view all tiers" ON user_tiers FOR SELECT USING (auth.uid() IS NOT NULL);

-- Add tier discount columns to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tier_discount_applied TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tier_discount_percent INTEGER;

-- Create trigger for updated_at
CREATE TRIGGER update_user_tiers_updated_at
  BEFORE UPDATE ON user_tiers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();