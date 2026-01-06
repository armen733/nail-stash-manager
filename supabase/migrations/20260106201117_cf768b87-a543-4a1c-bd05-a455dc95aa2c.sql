-- Add supplier_sku and category_attributes to products table
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS supplier_sku text,
ADD COLUMN IF NOT EXISTS category_attributes jsonb DEFAULT '{}'::jsonb;

-- Create table for category field configurations (admin-configurable)
CREATE TABLE public.category_field_configs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category text NOT NULL,
  field_name text NOT NULL,
  field_label text NOT NULL,
  field_type text NOT NULL DEFAULT 'text', -- text, number, select, textarea
  options jsonb DEFAULT NULL, -- for select fields: ["Option1", "Option2"]
  is_required boolean DEFAULT false,
  display_order integer DEFAULT 0,
  placeholder text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(category, field_name)
);

-- Enable RLS
ALTER TABLE public.category_field_configs ENABLE ROW LEVEL SECURITY;

-- Anyone can view field configs (needed for forms)
CREATE POLICY "Anyone can view category field configs" 
ON public.category_field_configs 
FOR SELECT 
USING (true);

-- Only authenticated users can manage configs
CREATE POLICY "Authenticated users can manage category field configs" 
ON public.category_field_configs 
FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Create index for faster category lookups
CREATE INDEX idx_category_field_configs_category ON public.category_field_configs(category);

-- Add trigger for updated_at
CREATE TRIGGER update_category_field_configs_updated_at
BEFORE UPDATE ON public.category_field_configs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();