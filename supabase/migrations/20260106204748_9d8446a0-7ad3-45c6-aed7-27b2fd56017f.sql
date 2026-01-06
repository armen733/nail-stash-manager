-- Add sibling_group_id column to products for grouping siblings
ALTER TABLE public.products ADD COLUMN sibling_group_id uuid DEFAULT NULL;

-- Create an index for faster sibling lookups
CREATE INDEX idx_products_sibling_group ON public.products(sibling_group_id) WHERE sibling_group_id IS NOT NULL;

-- Create a table to store sibling group metadata (optional, for naming groups)
CREATE TABLE public.product_sibling_groups (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.product_sibling_groups ENABLE ROW LEVEL SECURITY;

-- Allow anyone to view sibling groups
CREATE POLICY "Anyone can view sibling groups" ON public.product_sibling_groups
  FOR SELECT USING (true);

-- Authenticated users can manage sibling groups
CREATE POLICY "Authenticated users can manage sibling groups" ON public.product_sibling_groups
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Add foreign key constraint
ALTER TABLE public.products 
  ADD CONSTRAINT products_sibling_group_id_fkey 
  FOREIGN KEY (sibling_group_id) 
  REFERENCES public.product_sibling_groups(id) 
  ON DELETE SET NULL;