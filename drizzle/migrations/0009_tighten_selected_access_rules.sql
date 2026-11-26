DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
CREATE POLICY "Users view own profile or manager" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_manager());

DROP POLICY IF EXISTS "Authenticated users can insert edit history" ON public.order_edit_history;
DROP POLICY IF EXISTS "Authenticated users can view edit history" ON public.order_edit_history;
CREATE POLICY "Managers insert edit history" ON public.order_edit_history FOR INSERT TO authenticated WITH CHECK (public.is_manager() AND (edited_by IS NULL OR edited_by = auth.uid()));
CREATE POLICY "Managers view edit history" ON public.order_edit_history FOR SELECT TO authenticated USING (public.is_manager());

DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Authenticated users can view audit logs" ON public.audit_logs;
CREATE POLICY "Managers insert audit logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (public.is_manager() AND (actor_id IS NULL OR actor_id = auth.uid()));
CREATE POLICY "Managers view audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (public.is_manager());

DROP POLICY IF EXISTS "public_insert_order_items" ON public.order_items;
DROP POLICY IF EXISTS "public_insert_orders" ON public.orders;

DROP POLICY IF EXISTS "Authenticated can read shipping settings" ON public.shipping_settings;
CREATE POLICY "Managers read shipping settings" ON public.shipping_settings FOR SELECT TO authenticated USING (public.is_manager());

DROP POLICY IF EXISTS "Signed-in users view stock levels" ON public.product_stock;
CREATE POLICY "Managers view stock levels" ON public.product_stock FOR SELECT TO authenticated USING (public.is_manager());

DROP POLICY IF EXISTS "Authenticated can upload production invoices" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload brand assets" ON storage.objects;
CREATE POLICY "Managers upload production invoices" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'production-invoices' AND public.is_manager() AND owner_id = (select auth.uid()::text));
CREATE POLICY "Managers upload product images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-images' AND public.is_manager() AND owner_id = (select auth.uid()::text));
CREATE POLICY "Managers upload brand assets" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'brand-assets' AND public.is_manager() AND owner_id = (select auth.uid()::text));