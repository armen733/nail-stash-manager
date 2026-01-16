-- Add unique constraint on user_id for abandoned_carts to enable proper upsert
-- First, clean up any duplicate carts per user (keep the most recent one)
DELETE FROM public.abandoned_carts a
WHERE a.id NOT IN (
  SELECT DISTINCT ON (user_id) id
  FROM public.abandoned_carts
  WHERE user_id IS NOT NULL
  ORDER BY user_id, updated_at DESC
)
AND a.user_id IS NOT NULL;

-- Now add the unique constraint
ALTER TABLE public.abandoned_carts 
ADD CONSTRAINT abandoned_carts_user_id_unique UNIQUE (user_id);