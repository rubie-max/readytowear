-- Run once in Supabase: SQL Editor > New query > paste > Run.

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  category text not null,
  color text,
  status text not null default 'clean',
  image_path text,
  fit jsonb,
  needs_ironing boolean not null default false,
  wears_before_wash int not null default 1,
  wears_since_wash int not null default 0,
  wear_count int not null default 0,
  last_worn date,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.outfits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  item_ids uuid[] not null default '{}',
  notes text,
  wear_count int not null default 0,
  last_worn date,
  created_at timestamptz not null default now()
);

create table if not exists public.plans (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  outfit_id uuid not null references public.outfits on delete cascade,
  primary key (user_id, day)
);

create table if not exists public.wear_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  outfit_id uuid references public.outfits on delete set null,
  outfit_name text,
  item_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Only the signed-in owner can see or change their rows.
alter table public.items enable row level security;
alter table public.outfits enable row level security;
alter table public.plans enable row level security;
alter table public.wear_log enable row level security;

drop policy if exists "own items" on public.items;
create policy "own items" on public.items for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own outfits" on public.outfits;
create policy "own outfits" on public.outfits for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own plans" on public.plans;
create policy "own plans" on public.plans for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own wear log" on public.wear_log;
create policy "own wear log" on public.wear_log for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Private picture storage: each user can only touch files inside a folder named after their user id.
insert into storage.buckets (id, name, public)
values ('clothes', 'clothes', false)
on conflict (id) do nothing;

drop policy if exists "own clothes pictures" on storage.objects;
create policy "own clothes pictures" on storage.objects for all to authenticated
  using (bucket_id = 'clothes' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'clothes' and (storage.foldername(name))[1] = auth.uid()::text);
