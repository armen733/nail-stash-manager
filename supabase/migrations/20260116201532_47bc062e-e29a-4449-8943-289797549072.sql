-- Drop all triggers on orders table that call notify_new_order
DROP TRIGGER IF EXISTS trigger_notify_new_order ON public.orders;
DROP TRIGGER IF EXISTS on_new_order_notify ON public.orders;
DROP TRIGGER IF EXISTS on_new_order ON public.orders;

-- Drop the function
DROP FUNCTION IF EXISTS public.notify_new_order() CASCADE;