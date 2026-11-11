DROP POLICY IF EXISTS "Managers manage partner payouts" ON public.partner_payouts;
CREATE POLICY "Owners manage partner payouts" ON public.partner_payouts FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'Owner'))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'Owner'));