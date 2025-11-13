-- Add product variants support
-- Add columns for parent-child product relationships
ALTER TABLE public.products 
ADD COLUMN parent_product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
ADD COLUMN is_parent boolean NOT NULL DEFAULT false,
ADD COLUMN variant_name text;

-- Create index for better performance when querying variants
CREATE INDEX idx_products_parent_id ON public.products(parent_product_id);
CREATE INDEX idx_products_is_parent ON public.products(is_parent) WHERE is_parent = true;

-- Add a comment to clarify the structure
COMMENT ON COLUMN public.products.parent_product_id IS 'References the parent product if this is a variant. NULL if this is a standalone or parent product.';
COMMENT ON COLUMN public.products.is_parent IS 'True if this product has variants (is a parent product). False for standalone or variant products.';
COMMENT ON COLUMN public.products.variant_name IS 'Display name for this variant (e.g., "Small - Fine Grit", "Medium - Coarse"). NULL for parent products.';