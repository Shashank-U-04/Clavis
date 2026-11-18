-- Clavis workspace: profiles, plans, saved versions, activity, and the hosted assistant's
-- daily allowance. Every table has row-level security: a signed-in person reads and writes
-- only their own rows. Run once in Supabase -> SQL Editor (safe to re-run).
--
-- The project was created with "grant API access to new tables" OFF and "RLS on new tables"
-- ON, so access is granted explicitly below, table by table.

-- ------------------------------------------------------------------------------- profiles

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '' check (char_length(name) <= 80),
  hue smallint not null default 210 check (hue between 0 and 359),
  role text not null default '' check (char_length(role) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- a profile appears with every new account, named from the sign-up form or Google
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name, hue)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1), ''), 80),
    (abs(hashtext(new.id::text)) % 360)::smallint
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --------------------------------------------------------------------------------- plans
-- id is the plan id the app generated (unique per person, not globally), so the key is
-- (user_id, id). meta is the plan's index entry; document is the design itself.

create table if not exists public.projects (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 64),
  meta jsonb not null,
  document jsonb not null,
  updated_at timestamptz not null default now(),
  -- set when the plan is deleted, so other devices remove it too
  deleted_at timestamptz,
  primary key (user_id, id),
  check (octet_length(document::text) < 4000000)
);

create index if not exists projects_user_updated on public.projects (user_id, updated_at desc);

-- ------------------------------------------------------------------------------ versions

create table if not exists public.project_versions (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id text not null check (char_length(project_id) between 1 and 64),
  id text not null check (char_length(id) between 1 and 64),
  meta jsonb not null,
  document jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, project_id, id),
  check (octet_length(document::text) < 4000000)
);

-- ------------------------------------------------------------------------------ activity

create table if not exists public.activity (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 64),
  at timestamptz not null,
  event jsonb not null check (octet_length(event::text) < 4000),
  primary key (user_id, id)
);

create index if not exists activity_user_at on public.activity (user_id, at desc);

-- ------------------------------------------------- hosted assistant: requests per day
-- Written only by the server (service role) through the two functions below, so nobody
-- can give themselves more allowance from the browser.

create table if not exists public.assistant_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  count integer not null default 0 check (count >= 0),
  primary key (user_id, day)
);

-- take one request from today's allowance; returns what is left, or -1 when none was left
create or replace function public.consume_assistant_request(p_user uuid, p_cap integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  used integer;
begin
  insert into public.assistant_usage as u (user_id, day, count)
  values (p_user, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update set count = u.count + 1
    where u.count < p_cap
  returning count into used;
  if used is null then
    return -1;
  end if;
  return p_cap - used;
end;
$$;

-- give one back: the request never reached the model (busy, unreachable)
create or replace function public.refund_assistant_request(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.assistant_usage set count = greatest(count - 1, 0)
  where user_id = p_user and day = (now() at time zone 'utc')::date;
$$;

-- ----------------------------------------------------------------- row-level security

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_versions enable row level security;
alter table public.activity enable row level security;
alter table public.assistant_usage enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists "own plans" on public.projects;
create policy "own plans" on public.projects
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "own versions" on public.project_versions;
create policy "own versions" on public.project_versions
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "own activity" on public.activity;
create policy "own activity" on public.activity
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- people may read their own allowance; only the functions above change it
drop policy if exists "read own usage" on public.assistant_usage;
create policy "read own usage" on public.assistant_usage
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ------------------------------------------------------------------------------ grants
-- signed-in people only; guests (anon) get nothing

revoke all on public.profiles, public.projects, public.project_versions, public.activity, public.assistant_usage from anon;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.project_versions to authenticated;
grant select, insert, update, delete on public.activity to authenticated;
grant select on public.assistant_usage to authenticated;
grant all on public.profiles, public.projects, public.project_versions, public.activity, public.assistant_usage to service_role;

revoke execute on function public.consume_assistant_request(uuid, integer) from public, anon, authenticated;
revoke execute on function public.refund_assistant_request(uuid) from public, anon, authenticated;
grant execute on function public.consume_assistant_request(uuid, integer) to service_role;
grant execute on function public.refund_assistant_request(uuid) to service_role;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
