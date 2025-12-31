-- Update the notify_new_order function to use correct net schema
CREATE OR REPLACE FUNCTION public.notify_new_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  customer_name_val TEXT;
BEGIN
  -- Get customer name from the order
  customer_name_val := COALESCE(NEW.customer_name, 'Customer');
  
  -- Use pg_net to call the edge function (fire and forget)
  PERFORM net.http_post(
    url := 'https://wxwdlyiyrqwgiwtmrajp.supabase.co/functions/v1/send-push-notification',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4d2RseWl5cnF3Z2l3dG1yYWpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAyOTMyNjcsImV4cCI6MjA3NTg2OTI2N30.Dj3bPdg2Ze-4UYgjyUq3WzTzTlx5TpXr8bRqmXOklL8"}'::jsonb,
    body := jsonb_build_object('customerName', customer_name_val)
  );
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Don't fail the transaction if notification fails
  RAISE WARNING 'Failed to send order notification: %', SQLERRM;
  RETURN NEW;
END;
$function$;