
CREATE POLICY "Authenticated can read production invoices"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'production-invoices');

CREATE POLICY "Authenticated can upload production invoices"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'production-invoices');

CREATE POLICY "Authenticated can update production invoices"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'production-invoices')
  WITH CHECK (bucket_id = 'production-invoices');

CREATE POLICY "Authenticated can delete production invoices"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'production-invoices');
