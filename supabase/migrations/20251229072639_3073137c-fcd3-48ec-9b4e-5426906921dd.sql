-- Create a function to call the push notification edge function when a new order is created
CREATE OR REPLACE FUNCTION public.notify_new_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  customer_name TEXT;
BEGIN
  -- Get customer name from the order
  customer_name := COALESCE(NEW.customer_name, 'Customer');
  
  -- Use pg_net to call the edge function (fire and forget)
  PERFORM net.http_post(
    url := 'https://wxwdlyiyrqwgiwtmrajp.supabase.co/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object('customerName', customer_name)
  );
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Don't fail the transaction if notification fails
  RAISE WARNING 'Failed to send order notification: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Create trigger to fire on new order insert
DROP TRIGGER IF EXISTS trigger_notify_new_order ON public.orders;
CREATE TRIGGER trigger_notify_new_order
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_order();