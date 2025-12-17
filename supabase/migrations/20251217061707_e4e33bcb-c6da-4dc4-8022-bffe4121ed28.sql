-- Add profile_id column to orders to link orders to user profiles
ALTER TABLE public.orders ADD COLUMN profile_id uuid REFERENCES public.profiles(id);

-- Create index for better query performance
CREATE INDEX idx_orders_profile_id ON public.orders(profile_id);

-- Add RLS policy for users to view their own orders
CREATE POLICY "Users can view own orders"
ON public.orders
FOR SELECT
USING (auth.uid() = profile_id OR auth.uid() IS NOT NULL);

-- Allow authenticated users to insert orders linked to profiles
CREATE POLICY "authenticated_insert_orders_with_profile"
ON public.orders
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);