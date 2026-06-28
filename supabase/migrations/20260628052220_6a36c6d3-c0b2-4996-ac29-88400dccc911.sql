
CREATE OR REPLACE FUNCTION public.validate_referral_code(code text)
RETURNS TABLE (
  is_valid boolean,
  referrer_id uuid,
  referrer_name text,
  referral_code text,
  commission_rate numeric,
  status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (r.id IS NOT NULL AND r.status = 'active') AS is_valid,
    r.id,
    r.name,
    r.referral_code,
    r.commission_rate,
    r.status
  FROM public.referrers r
  WHERE lower(r.referral_code) = lower(code)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.validate_referral_code(text) TO anon, authenticated;
