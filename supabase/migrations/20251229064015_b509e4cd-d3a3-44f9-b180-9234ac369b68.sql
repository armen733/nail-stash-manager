-- Create loyalty_settings table for configurable points conversion
CREATE TABLE public.loyalty_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  points_per_dollar integer NOT NULL DEFAULT 1,
  points_required_for_redemption integer NOT NULL DEFAULT 100,
  redemption_value_usd numeric NOT NULL DEFAULT 5.00,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.loyalty_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can read settings
CREATE POLICY "Anyone can view loyalty settings"
ON public.loyalty_settings
FOR SELECT
USING (true);

-- Only authenticated users can update settings (admins should be the ones doing this)
CREATE POLICY "Authenticated users can update loyalty settings"
ON public.loyalty_settings
FOR UPDATE
USING (auth.uid() IS NOT NULL);

-- Insert default settings row
INSERT INTO public.loyalty_settings (points_per_dollar, points_required_for_redemption, redemption_value_usd)
VALUES (1, 100, 5.00);

-- Create trigger for updated_at
CREATE TRIGGER update_loyalty_settings_updated_at
BEFORE UPDATE ON public.loyalty_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();