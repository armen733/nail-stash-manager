CREATE TABLE public.order_edit_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL,
  edited_by UUID,
  edited_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  snapshot JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_edit_history_order_id ON public.order_edit_history(order_id);
CREATE INDEX idx_order_edit_history_edited_at ON public.order_edit_history(edited_at DESC);

ALTER TABLE public.order_edit_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view edit history"
ON public.order_edit_history FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert edit history"
ON public.order_edit_history FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);