-- Create table for push notification subscriptions
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamp with time zone default now() not null,
  unique(user_id, endpoint)
);

-- Enable RLS
alter table public.push_subscriptions enable row level security;

-- Users can manage their own subscriptions
create policy "Users can insert own subscriptions"
  on public.push_subscriptions for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can view own subscriptions"
  on public.push_subscriptions for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can delete own subscriptions"
  on public.push_subscriptions for delete
  to authenticated
  using (auth.uid() = user_id);