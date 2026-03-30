
-- Drop the existing INSERT-only trigger
DROP TRIGGER IF EXISTS on_order_auto_checkin ON public.orders;

-- Update the function to handle both INSERT and UPDATE cases
CREATE OR REPLACE FUNCTION public.auto_checkin_on_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- On INSERT: create visit if salon_id is set
  IF TG_OP = 'INSERT' AND NEW.salon_id IS NOT NULL THEN
    INSERT INTO public.salon_visits (salon_id, visited_by, visit_type, order_id, notes)
    VALUES (
      NEW.salon_id,
      NEW.created_by,
      'order',
      NEW.id,
      'Auto check-in from order'
    );
  END IF;

  -- On UPDATE: create visit if salon_id changed from NULL to a value
  IF TG_OP = 'UPDATE' AND OLD.salon_id IS NULL AND NEW.salon_id IS NOT NULL THEN
    INSERT INTO public.salon_visits (salon_id, visited_by, visit_type, order_id, notes)
    VALUES (
      NEW.salon_id,
      NEW.created_by,
      'order',
      NEW.id,
      'Auto check-in from order (salon assigned)'
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- Recreate trigger for both INSERT and UPDATE
CREATE TRIGGER on_order_auto_checkin
  AFTER INSERT OR UPDATE OF salon_id ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_checkin_on_order();
