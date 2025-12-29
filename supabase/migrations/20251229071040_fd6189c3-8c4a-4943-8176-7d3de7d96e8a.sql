-- Create the category_variant_types table
CREATE TABLE public.category_variant_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  variant_type TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(category, variant_type)
);

-- Enable RLS
ALTER TABLE public.category_variant_types ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access" ON public.category_variant_types
  FOR SELECT USING (true);

-- Insert the category-variant mappings
INSERT INTO public.category_variant_types (category, variant_type, display_order) VALUES
  -- Drill Bits
  ('Drill Bits', 'Carbide', 1),
  ('Drill Bits', 'Ceramic', 2),
  ('Drill Bits', 'Diamond', 3),
  -- Nippers
  ('Nippers', 'Cuticle Nipper', 1),
  ('Nippers', 'Nail Nipper', 2),
  ('Nippers', 'Ingrown Nipper', 3),
  -- Abrasives
  ('Abrasives', 'Sanding Bands', 1),
  ('Abrasives', 'Buffing Discs', 2),
  ('Abrasives', 'Files', 3),
  -- Scissors
  ('Scissors', 'Cuticle Scissors', 1),
  ('Scissors', 'Nail Scissors', 2),
  -- Brushes
  ('Brushes', 'Dust Brush', 1),
  ('Brushes', 'Nail Art Brush', 2),
  -- Tweezers
  ('Tweezers', 'Straight', 1),
  ('Tweezers', 'Curved', 2),
  -- Pushers
  ('Pushers', 'Cuticle Pusher', 1),
  -- Tips
  ('Tips', 'Full Cover', 1),
  ('Tips', 'Half Cover', 2);