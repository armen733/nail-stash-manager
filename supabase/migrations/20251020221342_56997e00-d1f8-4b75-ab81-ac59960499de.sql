-- Allow anon to select their own orders after insert (needed for .insert().select())
-- Only allows reading orders created by anon (created_by IS NULL)
create policy anon_select_own_orders on public.orders
for select to anon
using (created_by is null);