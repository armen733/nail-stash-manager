GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_payouts TO authenticated;
GRANT ALL ON public.partner_payouts TO service_role;
DROP POLICY IF EXISTS "Owners manage partner payouts" ON public.partner_payouts;
CREATE POLICY "Managers manage partner payouts" ON public.partner_payouts FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('Owner','Sales Rep')))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('Owner','Sales Rep')));