-- Backfill schema drift: grocery_items was created ad hoc in the dashboard and
-- never committed. The app queries it during hydrate (all-or-nothing), so a
-- database built from the repo alone fails to load the app entirely.
-- Idempotent so it is a no-op on the live database that already has the table.

create table if not exists grocery_items (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  text text not null check (char_length(text) <= 500),
  checked boolean default false not null,
  created_at timestamptz default now() not null
);

create index if not exists idx_grocery_items_user_id on grocery_items(user_id);

alter table grocery_items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'grocery_items' and policyname = 'Users can view own grocery items'
  ) then
    create policy "Users can view own grocery items"
      on grocery_items for select using (auth.uid() = user_id);
    create policy "Users can insert own grocery items"
      on grocery_items for insert with check (auth.uid() = user_id);
    create policy "Users can update own grocery items"
      on grocery_items for update using (auth.uid() = user_id);
    create policy "Users can delete own grocery items"
      on grocery_items for delete using (auth.uid() = user_id);
  end if;
end $$;
