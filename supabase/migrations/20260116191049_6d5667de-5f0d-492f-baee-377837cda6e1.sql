-- Drop the trigger that causes duplicate notifications for Stripe orders
DROP TRIGGER IF EXISTS on_new_order ON public.orders;