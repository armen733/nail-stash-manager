-- Add customer information fields to orders table
ALTER TABLE public.orders
ADD COLUMN customer_name TEXT,
ADD COLUMN customer_email TEXT,
ADD COLUMN customer_phone TEXT,
ADD COLUMN customer_address TEXT;

-- Drop existing RLS policies for orders
DROP POLICY IF EXISTS "Authenticated users can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can view orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can update orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can delete orders" ON public.orders;

-- Create new RLS policies that allow guest orders
-- Allow anyone to insert orders (guest checkout)
CREATE POLICY "Anyone can create orders"
ON public.orders
FOR INSERT
WITH CHECK (true);

-- Authenticated users can view all orders (for manager app)
CREATE POLICY "Authenticated users can view all orders"
ON public.orders
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Authenticated users can update orders (for manager app)
CREATE POLICY "Authenticated users can update orders"
ON public.orders
FOR UPDATE
USING (auth.uid() IS NOT NULL);

-- Authenticated users can delete orders (for manager app)
CREATE POLICY "Authenticated users can delete orders"
ON public.orders
FOR DELETE
USING (auth.uid() IS NOT NULL);

-- Update order_items RLS to allow guest order items
DROP POLICY IF EXISTS "Authenticated users can insert order items" ON public.order_items;
DROP POLICY IF EXISTS "Authenticated users can view order items" ON public.order_items;

-- Allow anyone to insert order items (for guest checkout)
CREATE POLICY "Anyone can create order items"
ON public.order_items
FOR INSERT
WITH CHECK (true);

-- Authenticated users can view all order items (for manager app)
CREATE POLICY "Authenticated users can view all order items"
ON public.order_items
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Update products RLS to allow public viewing (for customer app)
DROP POLICY IF EXISTS "Authenticated users can view products" ON public.products;

-- Allow anyone to view products (public catalog)
CREATE POLICY "Anyone can view products"
ON public.products
FOR SELECT
USING (true);

-- Keep authenticated-only policies for products management
CREATE POLICY "Authenticated users can manage products"
ON public.products
FOR ALL
USING (auth.uid() IS NOT NULL);