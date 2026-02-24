-- CookSnap Database Schema
-- Run this in the Supabase SQL Editor to set up the database.

-- ============================================================
-- TABLES
-- ============================================================

-- Profiles (auto-created when a user signs up)
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Recipes
create table recipes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  title text not null,
  image text,
  source_url text not null default '',
  prep_time text,
  cook_time text,
  total_time text,
  servings text,
  author text,
  cuisine_type text,
  difficulty text check (difficulty in ('Easy', 'Medium', 'Hard')),
  rating smallint check (rating >= 1 and rating <= 5),
  is_favorite boolean default false not null,
  notes text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Recipe ingredients (one row per ingredient line)
create table recipe_ingredients (
  id uuid default gen_random_uuid() primary key,
  recipe_id uuid references recipes(id) on delete cascade not null,
  text text not null,
  sort_order integer not null default 0
);

-- Recipe instructions (one row per step)
create table recipe_instructions (
  id uuid default gen_random_uuid() primary key,
  recipe_id uuid references recipes(id) on delete cascade not null,
  text text not null,
  sort_order integer not null default 0
);

-- Recipe tags
create table recipe_tags (
  id uuid default gen_random_uuid() primary key,
  recipe_id uuid references recipes(id) on delete cascade not null,
  tag text not null
);

-- Meal plans (multiple recipes per slot, ordered by position)
create table meal_plans (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  date date not null,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  recipe_id uuid references recipes(id) on delete cascade not null,
  is_leftover boolean default false,
  position smallint not null default 0,
  unique (user_id, date, meal_type, recipe_id)
);

-- Meal templates (saved weekly meal plan patterns)
create table meal_templates (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  name text not null,
  template jsonb not null,
  created_at timestamptz default now()
);

-- Shopping items
create table shopping_items (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  text text not null,
  checked boolean default false not null,
  recipe_id uuid references recipes(id) on delete set null
);

-- Checked ingredients (tracks which ingredient indices are checked per recipe)
create table checked_ingredients (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  recipe_id uuid references recipes(id) on delete cascade not null,
  ingredient_index integer not null,
  unique (user_id, recipe_id, ingredient_index)
);

-- Recipe groups (user-defined collections like "Weeknight Dinners", "Favorites")
create table recipe_groups (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  name text not null,
  icon text,
  sort_order integer default 0,
  is_default boolean default false,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Recipe group members (junction table linking recipes to groups)
create table recipe_group_members (
  id uuid default gen_random_uuid() primary key,
  group_id uuid references recipe_groups(id) on delete cascade not null,
  recipe_id uuid references recipes(id) on delete cascade not null,
  added_at timestamptz default now() not null,
  unique (group_id, recipe_id)
);

-- ============================================================
-- INDEXES
-- ============================================================

create index idx_recipes_user_id on recipes(user_id);
create index idx_recipe_ingredients_recipe_id on recipe_ingredients(recipe_id);
create index idx_recipe_instructions_recipe_id on recipe_instructions(recipe_id);
create index idx_recipe_tags_recipe_id on recipe_tags(recipe_id);
create index idx_meal_plans_user_id on meal_plans(user_id);
create index idx_meal_plans_date on meal_plans(user_id, date);
create index idx_meal_templates_user_id on meal_templates(user_id);
create index idx_shopping_items_user_id on shopping_items(user_id);
create index idx_checked_ingredients_user_recipe on checked_ingredients(user_id, recipe_id);
create index idx_recipe_groups_user_id on recipe_groups(user_id);
create index idx_recipe_group_members_group_id on recipe_group_members(group_id);
create index idx_recipe_group_members_recipe_id on recipe_group_members(recipe_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table profiles enable row level security;
alter table recipes enable row level security;
alter table recipe_ingredients enable row level security;
alter table recipe_instructions enable row level security;
alter table recipe_tags enable row level security;
alter table meal_plans enable row level security;
alter table meal_templates enable row level security;
alter table shopping_items enable row level security;
alter table checked_ingredients enable row level security;
alter table recipe_groups enable row level security;
alter table recipe_group_members enable row level security;

-- Profiles: users can read/update their own profile
create policy "Users can view own profile"
  on profiles for select using (auth.uid() = id);

create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

-- Recipes: full CRUD on own recipes
create policy "Users can view own recipes"
  on recipes for select using (auth.uid() = user_id);

create policy "Users can insert own recipes"
  on recipes for insert with check (auth.uid() = user_id);

create policy "Users can update own recipes"
  on recipes for update using (auth.uid() = user_id);

create policy "Users can delete own recipes"
  on recipes for delete using (auth.uid() = user_id);

-- Recipe ingredients: access via recipe ownership
create policy "Users can view own recipe ingredients"
  on recipe_ingredients for select
  using (exists (select 1 from recipes where recipes.id = recipe_id and recipes.user_id = auth.uid()));

create policy "Users can insert own recipe ingredients"
  on recipe_ingredients for insert
  with check (exists (select 1 from recipes where recipes.id = recipe_id and recipes.user_id = auth.uid()));

create policy "Users can update own recipe ingredients"
  on recipe_ingredients for update
  using (exists (select 1 from recipes where recipes.id = recipe_id and recipes.user_id = auth.uid()));

create policy "Users can delete own recipe ingredients"
  on recipe_ingredients for delete
  using (exists (select 1 from recipes where recipes.id = recipe_id and recipes.user_id = auth.uid()));

-- Recipe instructions: access via recipe ownership
create policy "Users can view own recipe instructions"
  on recipe_instructions for select
  using (exists (select 1 from recipes where recipes.id = recipe_id and recipes.user_id = auth.uid()));

create policy "Users can insert own recipe instructions"
  on recipe_instructions for insert
  with check (exists (select 1 from recipes where recipes.id = recipe_id and recipes.user_id = auth.uid()));

create policy "Users can update own recipe instructions"
  on recipe_instructions for update
  using (exists (select 1 from recipes where recipes.id = recipe_id and recipes.user_id = auth.uid()));

create policy "Users can delete own recipe instructions"
  on recipe_instructions for delete
  using (exists (select 1 from recipes where recipes.id = recipe_id and recipes.user_id = auth.uid()));

-- Recipe tags: access via recipe ownership
create policy "Users can view own recipe tags"
  on recipe_tags for select
  using (exists (select 1 from recipes where recipes.id = recipe_id and recipes.user_id = auth.uid()));

create policy "Users can insert own recipe tags"
  on recipe_tags for insert
  with check (exists (select 1 from recipes where recipes.id = recipe_id and recipes.user_id = auth.uid()));

create policy "Users can update own recipe tags"
  on recipe_tags for update
  using (exists (select 1 from recipes where recipes.id = recipe_id and recipes.user_id = auth.uid()));

create policy "Users can delete own recipe tags"
  on recipe_tags for delete
  using (exists (select 1 from recipes where recipes.id = recipe_id and recipes.user_id = auth.uid()));

-- Meal plans: full CRUD on own meal plans
create policy "Users can view own meal plans"
  on meal_plans for select using (auth.uid() = user_id);

create policy "Users can insert own meal plans"
  on meal_plans for insert with check (auth.uid() = user_id);

create policy "Users can update own meal plans"
  on meal_plans for update using (auth.uid() = user_id);

create policy "Users can delete own meal plans"
  on meal_plans for delete using (auth.uid() = user_id);

-- Meal templates: full CRUD on own templates
create policy "Users can manage own templates"
  on meal_templates for all using (auth.uid() = user_id);

-- Shopping items: full CRUD on own items
create policy "Users can view own shopping items"
  on shopping_items for select using (auth.uid() = user_id);

create policy "Users can insert own shopping items"
  on shopping_items for insert with check (auth.uid() = user_id);

create policy "Users can update own shopping items"
  on shopping_items for update using (auth.uid() = user_id);

create policy "Users can delete own shopping items"
  on shopping_items for delete using (auth.uid() = user_id);

-- Checked ingredients: full CRUD on own data
create policy "Users can view own checked ingredients"
  on checked_ingredients for select using (auth.uid() = user_id);

create policy "Users can insert own checked ingredients"
  on checked_ingredients for insert with check (auth.uid() = user_id);

create policy "Users can update own checked ingredients"
  on checked_ingredients for update using (auth.uid() = user_id);

create policy "Users can delete own checked ingredients"
  on checked_ingredients for delete using (auth.uid() = user_id);

-- Recipe groups: full CRUD on own groups
create policy "Users can view own recipe groups"
  on recipe_groups for select using (auth.uid() = user_id);

create policy "Users can insert own recipe groups"
  on recipe_groups for insert with check (auth.uid() = user_id);

create policy "Users can update own recipe groups"
  on recipe_groups for update using (auth.uid() = user_id);

create policy "Users can delete own recipe groups"
  on recipe_groups for delete using (auth.uid() = user_id);

-- Recipe group members: access via group ownership
create policy "Users can view own group members"
  on recipe_group_members for select
  using (exists (select 1 from recipe_groups where recipe_groups.id = group_id and recipe_groups.user_id = auth.uid()));

create policy "Users can insert own group members"
  on recipe_group_members for insert
  with check (exists (select 1 from recipe_groups where recipe_groups.id = group_id and recipe_groups.user_id = auth.uid()));

create policy "Users can update own group members"
  on recipe_group_members for update
  using (exists (select 1 from recipe_groups where recipe_groups.id = group_id and recipe_groups.user_id = auth.uid()));

create policy "Users can delete own group members"
  on recipe_group_members for delete
  using (exists (select 1 from recipe_groups where recipe_groups.id = group_id and recipe_groups.user_id = auth.uid()));

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-create a profile row when a new user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Auto-update the updated_at column
create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at_profiles
  before update on profiles
  for each row execute function public.update_updated_at();

create trigger set_updated_at_recipes
  before update on recipes
  for each row execute function public.update_updated_at();

create trigger set_updated_at_recipe_groups
  before update on recipe_groups
  for each row execute function public.update_updated_at();
