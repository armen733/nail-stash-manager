CREATE TABLE public.ai_report_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  days INTEGER NOT NULL DEFAULT 90,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_report_sessions TO authenticated;
GRANT ALL ON public.ai_report_sessions TO service_role;

ALTER TABLE public.ai_report_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own AI report session"
ON public.ai_report_sessions
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_ai_report_sessions_updated_at
BEFORE UPDATE ON public.ai_report_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();