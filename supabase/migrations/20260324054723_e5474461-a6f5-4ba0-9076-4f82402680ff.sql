
-- Table to track salon visits
CREATE TABLE public.salon_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  visited_by uuid REFERENCES public.profiles(id),
  visit_type text NOT NULL DEFAULT 'manual',
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  notes text,
  visited_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.salon_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view salon visits"
  ON public.salon_visits FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert salon visits"
  ON public.salon_visits FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update salon visits"
  ON public.salon_visits FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete salon visits"
  ON public.salon_visits FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION public.auto_checkin_on_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.salon_id IS NOT NULL THEN
    INSERT INTO public.salon_visits (salon_id, visited_by, visit_type, order_id, notes)
    VALUES (
      NEW.salon_id,
      NEW.created_by,
      'order',
      NEW.id,
      'Auto check-in from order'
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_order_auto_checkin
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_checkin_on_order();
