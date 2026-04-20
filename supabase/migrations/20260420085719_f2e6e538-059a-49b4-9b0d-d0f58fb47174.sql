-- Create audit_logs table for global admin activity tracking
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id UUID,
  actor_name TEXT,
  actor_email TEXT,
  action TEXT NOT NULL, -- 'create' | 'update' | 'delete' | 'login' | 'export' | 'import' | 'other'
  entity_type TEXT NOT NULL, -- 'order' | 'product' | 'salon' | 'user' | 'commission' | 'stock' | etc.
  entity_id UUID,
  entity_label TEXT, -- human-readable label (e.g. order number, product name)
  summary TEXT, -- short human description
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_logs_actor ON public.audit_logs (actor_id);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all audit logs (admin/manager visibility)
CREATE POLICY "Authenticated users can view audit logs"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- Authenticated users can insert audit entries
CREATE POLICY "Authenticated users can insert audit logs"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- No update/delete policies = immutable log