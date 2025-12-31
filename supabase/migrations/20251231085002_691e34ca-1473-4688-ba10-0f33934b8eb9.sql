-- Re-create the notification function
CREATE OR REPLACE FUNCTION public.notify_new_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Use pg_net to call the edge function with full order details
  PERFORM net.http_post(
    url := 'https://wxwdlyiyrqwgiwtmrajp.supabase.co/functions/v1/send-push-notification',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4d2RseWl5cnF3Z2l3dG1yYWpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAyOTMyNjcsImV4cCI6MjA3NTg2OTI2N30.Dj3bPdg2Ze-4UYgjyUq3WzTzTlx5TpXr8bRqmXOklL8"}'::jsonb,
    body := jsonb_build_object(
      'orderId', NEW.id,
      'customerName', COALESCE(NEW.customer_name, 'Customer'),
      'customerPhone', NEW.customer_phone,
      'customerEmail', NEW.customer_email,
      'customerAddress', NEW.customer_address,
      'total', NEW.total,
      'orderDate', NEW.order_date
    )
  );
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Don't fail the transaction if notification fails
  RAISE WARNING 'Failed to send order notification: %', SQLERRM;
  RETURN NEW;
END;
$function$;

-- Create trigger for new orders
CREATE TRIGGER on_new_order_notify
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.notify_new_order();