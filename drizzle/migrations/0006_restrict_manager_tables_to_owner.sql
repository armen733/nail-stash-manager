CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'Owner'::app_role)
$$;
REVOKE EXECUTE ON FUNCTION public.is_manager() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_manager() TO authenticated;

DO $$
DECLARE r record;
  public_read text[] := ARRAY['products','product_images','product_sibling_groups','category_field_configs','company_settings','tax_settings','loyalty_settings','discount_codes'];
  tbls text[] := ARRAY['order_items','salon_credits','salons','discount_codes','supply_stores','referral_commissions','customer_referrals','loyalty_transactions','payments','salon_visits','location_product_prices','supply_store_products','products','returns','company_settings','stock_locations','tax_settings','product_images','stock_movements','user_roles','orders','category_field_configs','user_tiers','product_stock','referrers','production_orders','loyalty_settings','product_sibling_groups','return_items','business_expenses','password_reset_tokens','newsletter_subscribers'];
BEGIN
  FOR r IN SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies
           WHERE schemaname='public' AND tablename = ANY(tbls) LOOP
    IF r.policyname IN ('Allow public inserts','public_insert_orders','public_insert_order_items','anon_select_own_orders') THEN CONTINUE; END IF;
    IF r.cmd='SELECT' AND r.qual='true' AND r.tablename = ANY(public_read) THEN CONTINUE; END IF;
    IF coalesce(r.qual,'') IN ('true','(auth.uid() IS NOT NULL)') OR coalesce(r.with_check,'') IN ('true','(auth.uid() IS NOT NULL)')
       OR coalesce(r.qual,'') LIKE '%OR (auth.uid() IS NOT NULL))' THEN
      EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
    END IF;
  END LOOP;
  FOREACH r.tablename IN ARRAY tbls LOOP
    IF r.tablename NOT IN ('password_reset_tokens') THEN
      EXECUTE format('CREATE POLICY "Managers manage %s" ON public.%I FOR ALL TO authenticated USING (public.is_manager()) WITH CHECK (public.is_manager())', r.tablename, r.tablename);
    END IF;
  END LOOP;
END $$;

-- Customer-owned access
CREATE POLICY "Customers view own orders" ON public.orders FOR SELECT TO authenticated USING (profile_id = auth.uid());
CREATE POLICY "Customers create own orders" ON public.orders FOR INSERT TO authenticated WITH CHECK (profile_id = auth.uid());
CREATE POLICY "Customers view own order items" ON public.order_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.profile_id = auth.uid()));
CREATE POLICY "Customers add items to own orders" ON public.order_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.profile_id = auth.uid()));
CREATE POLICY "Customers view own referral link" ON public.customer_referrals FOR SELECT TO authenticated USING (customer_id = auth.uid());
CREATE POLICY "Customers record own referral" ON public.customer_referrals FOR INSERT TO authenticated WITH CHECK (customer_id = auth.uid());
CREATE POLICY "Referrers view own record" ON public.referrers FOR SELECT TO authenticated USING (linked_profile_id = auth.uid() OR status = 'active');
CREATE POLICY "Referrers view own commissions" ON public.referral_commissions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.referrers r WHERE r.id = referrer_id AND r.linked_profile_id = auth.uid()));
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Signed-in users view stock levels" ON public.product_stock FOR SELECT TO authenticated USING (true);
CREATE POLICY "Subscribers can update own subscription" ON public.newsletter_subscribers FOR UPDATE TO authenticated
  USING (lower(email) = lower(auth.jwt() ->> 'email')) WITH CHECK (lower(email) = lower(auth.jwt() ->> 'email'));

-- Storage
DROP POLICY IF EXISTS "Authenticated users can update product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can read production invoices" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update production invoices" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete production invoices" ON storage.objects;
CREATE POLICY "Managers update product images" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'product-images' AND public.is_manager()) WITH CHECK (bucket_id = 'product-images' AND public.is_manager());
CREATE POLICY "Managers delete product images" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-images' AND public.is_manager());
CREATE POLICY "Managers read production invoices" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'production-invoices' AND public.is_manager());
CREATE POLICY "Managers update production invoices" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'production-invoices' AND public.is_manager()) WITH CHECK (bucket_id = 'production-invoices' AND public.is_manager());
CREATE POLICY "Managers delete production invoices" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'production-invoices' AND public.is_manager());