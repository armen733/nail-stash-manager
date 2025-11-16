-- Add shape and direction columns to products table
ALTER TABLE public.products ADD COLUMN shape text;
ALTER TABLE public.products ADD COLUMN direction text;