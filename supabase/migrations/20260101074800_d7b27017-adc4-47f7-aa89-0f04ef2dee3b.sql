-- Create abandoned_carts table to track carts for abandoned cart emails
CREATE TABLE public.abandoned_carts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  email TEXT,
  name TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  email_sent_at TIMESTAMP WITH TIME ZONE,
  converted_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.abandoned_carts ENABLE ROW LEVEL SECURITY;

-- Policies for authenticated users
CREATE POLICY "Users can view own carts"
ON public.abandoned_carts
FOR SELECT
USING (auth.uid() = user_id OR auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert own carts"
ON public.abandoned_carts
FOR INSERT
WITH CHECK (auth.uid() = user_id OR auth.uid() IS NOT NULL);

CREATE POLICY "Users can update own carts"
ON public.abandoned_carts
FOR UPDATE
USING (auth.uid() = user_id OR auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete own carts"
ON public.abandoned_carts
FOR DELETE
USING (auth.uid() = user_id OR auth.uid() IS NOT NULL);

-- Trigger for updated_at
CREATE TRIGGER update_abandoned_carts_updated_at
BEFORE UPDATE ON public.abandoned_carts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();