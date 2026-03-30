
CREATE OR REPLACE FUNCTION public.auto_checkin_on_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- On INSERT: create visit if salon_id is set
  IF TG_OP = 'INSERT' AND NEW.salon_id IS NOT NULL THEN
    INSERT INTO public.salon_visits (salon_id, visited_by, visit_type, order_id, notes, visited_at)
    VALUES (
      NEW.salon_id,
      NEW.created_by,
      'order',
      NEW.id,
      'Auto check-in from order',
      NEW.created_at
    );
  END IF;

  -- On UPDATE: create visit if salon_id changed from NULL to a value, use original order date
  IF TG_OP = 'UPDATE' AND OLD.salon_id IS NULL AND NEW.salon_id IS NOT NULL THEN
    INSERT INTO public.salon_visits (salon_id, visited_by, visit_type, order_id, notes, visited_at)
    VALUES (
      NEW.salon_id,
      NEW.created_by,
      'order',
      NEW.id,
      'Auto check-in from order (salon assigned)',
      NEW.created_at
    );
  END IF;

  RETURN NEW;
END;
$function$;
