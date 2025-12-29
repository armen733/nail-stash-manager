-- Add missing discount_code column to orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS discount_code text NULL;