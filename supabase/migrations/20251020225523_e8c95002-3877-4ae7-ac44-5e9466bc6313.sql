-- Create UPDATE policy for upserts on push_subscriptions if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'push_subscriptions' 
      AND policyname = 'Users can update own subscriptions'
  ) THEN
    CREATE POLICY "Users can update own subscriptions"
    ON public.push_subscriptions
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;