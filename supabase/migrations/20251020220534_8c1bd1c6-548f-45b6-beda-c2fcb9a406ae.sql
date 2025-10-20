-- Explicit anon insert policies to support guest checkout from customer app

-- Drop conflicting policies first
drop policy if exists "Anyone can create orders" on public.orders;
drop policy if exists "Anyone can create order items" on public.order_items;

-- Orders: allow public inserts (no read/update/delete)
create policy public_insert_orders on public.orders
for insert to anon
with check (true);

-- Order items: allow public inserts
create policy public_insert_order_items on public.order_items
for insert to anon
with check (true);

-- Keep authenticated user insert policies
create policy authenticated_insert_orders on public.orders
for insert to authenticated
with check (true);

create policy authenticated_insert_order_items on public.order_items
for insert to authenticated
with check (true);