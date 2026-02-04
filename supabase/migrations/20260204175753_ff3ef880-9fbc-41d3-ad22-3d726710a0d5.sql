-- Add cost_usd column to products table for tracking purchase/cost price
ALTER TABLE public.products 
ADD COLUMN cost_usd numeric NULL;