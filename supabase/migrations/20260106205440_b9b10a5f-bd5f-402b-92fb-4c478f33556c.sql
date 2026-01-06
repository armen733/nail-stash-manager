-- Make group name optional (it's just for display/organization)
ALTER TABLE public.product_sibling_groups ALTER COLUMN name DROP NOT NULL;

-- Add a default empty string for existing rows
UPDATE public.product_sibling_groups SET name = '' WHERE name IS NULL;