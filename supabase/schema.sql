create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ratings (
  user_id uuid not null references auth.users(id) on delete cascade,
  movie_title text not null check (char_length(movie_title) between 1 and 180),
  rating smallint not null check (rating between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, movie_title)
);

create index if not exists ratings_movie_title_idx on public.ratings(movie_title);
create index if not exists ratings_user_id_idx on public.ratings(user_id);

alter table public.profiles enable row level security;
alter table public.ratings enable row level security;

drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "Users read own ratings" on public.ratings;
create policy "Users read own ratings" on public.ratings
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users add own ratings" on public.ratings;
create policy "Users add own ratings" on public.ratings
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users update own ratings" on public.ratings;
create policy "Users update own ratings" on public.ratings
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete own ratings" on public.ratings;
create policy "Users delete own ratings" on public.ratings
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.get_rating_summaries()
returns table(movie_title text, average_rating numeric, rating_count bigint)
language sql
stable
security definer set search_path = public
as $$
  select r.movie_title, round(avg(r.rating)::numeric, 1), count(*)
  from public.ratings r
  group by r.movie_title;
$$;

revoke all on function public.get_rating_summaries() from public;
grant execute on function public.get_rating_summaries() to anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.ratings to authenticated;
