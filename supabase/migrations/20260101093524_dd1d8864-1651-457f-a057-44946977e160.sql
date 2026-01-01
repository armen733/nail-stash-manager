-- Create newsletter_subscribers table
CREATE TABLE public.newsletter_subscribers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  used_welcome_code BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (for signups)
CREATE POLICY "Allow public inserts" ON public.newsletter_subscribers
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Allow reading subscriptions
CREATE POLICY "Allow reading subscriptions" ON public.newsletter_subscribers
  FOR SELECT TO anon, authenticated
  USING (true);

-- Allow authenticated users to update (for marking welcome code as used)
CREATE POLICY "Allow updates" ON public.newsletter_subscribers
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);