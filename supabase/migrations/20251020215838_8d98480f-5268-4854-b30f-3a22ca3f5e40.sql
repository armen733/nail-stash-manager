-- Make salon_id nullable to support online customer orders
ALTER TABLE public.orders
ALTER COLUMN salon_id DROP NOT NULL;

-- Create a default "Online Store" salon for customer app orders
INSERT INTO public.salons (name, contact_name, notes)
VALUES (
  'Online Store',
  'Customer Orders',
  'Default salon for online customer orders'
)
ON CONFLICT DO NOTHING;