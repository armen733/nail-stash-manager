-- Add missing discount and loyalty columns to orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS discount_amount numeric NULL,
ADD COLUMN IF NOT EXISTS points_earned integer NULL,
ADD COLUMN IF NOT EXISTS points_redeemed integer NULL;