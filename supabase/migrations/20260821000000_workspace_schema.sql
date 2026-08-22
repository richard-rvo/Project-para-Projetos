-- Gantt Dinamico: workspace foundation
-- One workspace has one owner and any number of members.
-- RLS is included here so the schema is never deployed without tenant isolation.

create extension if not exists pgcrypto;

create schema if not exists private;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  owner_id uuid not null references auth.users(id) on delete restrict,
  timezone text not null default 'America/Fortaleza',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role = 'member'),
  invited_by uuid not null references auth.users(id) on delete restrict,
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, email)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  start_date date,
  end_date date,
  status text not null default 'Planejado',
  calendars jsonb not null default '[]'::jsonb,
  default_calendar_id text,
  calendar_settings jsonb not null default '{"durationDisplay":"auto"}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null,
  name text not null default '',
  start_date timestamp without time zone,
  end_date timestamp without time zone,
  baseline_start timestamp without time zone,
  baseline_end timestamp without time zone,
  progress numeric(5, 2) not null default 0 check (progress between 0 and 100),
  schedule_mode text not null default 'auto' check (schedule_mode in ('auto', 'manual')),
  calendar_id text,
  depends_on jsonb not null default '[]'::jsonb,
  constraint_type text,
  constraint_date timestamp without time zone,
  indent_level integer not null default 0 check (indent_level >= 0),
  order_index integer not null default 0,
  resources jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (project_id, workspace_id)
    references public.projects (id, workspace_id) on delete cascade
);

create table if not exists public.anomalies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  title text not null default '',
  description text not null default '',
  status text not null default 'aberta',
  severity text,
  occurred_at timestamp without time zone,
  resolved_at timestamp without time zone,
  photos jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, workspace_id)
    references public.projects (id, workspace_id) on delete cascade
);

-- Foreign-key and tenant indexes support joins, cascades and RLS lookups.
create index if not exists workspace_members_user_id_idx on public.workspace_members (user_id);
create index if not exists workspace_members_workspace_id_idx on public.workspace_members (workspace_id);
create index if not exists workspace_invites_workspace_id_idx on public.workspace_invites (workspace_id);
create index if not exists projects_workspace_id_idx on public.projects (workspace_id);
create index if not exists tasks_workspace_id_idx on public.tasks (workspace_id);
create index if not exists tasks_project_id_idx on public.tasks (project_id);
create index if not exists anomalies_workspace_id_idx on public.anomalies (workspace_id);
create index if not exists anomalies_project_id_idx on public.anomalies (project_id);
create index if not exists anomalies_task_id_idx on public.anomalies (task_id);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function private.set_updated_at();

drop trigger if exists workspaces_set_updated_at on public.workspaces;
create trigger workspaces_set_updated_at before update on public.workspaces
for each row execute function private.set_updated_at();

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at before update on public.projects
for each row execute function private.set_updated_at();

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at before update on public.tasks
for each row execute function private.set_updated_at();

drop trigger if exists anomalies_set_updated_at on public.anomalies;
create trigger anomalies_set_updated_at before update on public.anomalies
for each row execute function private.set_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function private.add_workspace_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

drop trigger if exists on_workspace_created on public.workspaces;
create trigger on_workspace_created
  after insert on public.workspaces
  for each row execute function private.add_workspace_owner();

create or replace function private.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = $1
      and wm.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_workspace_owner(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspaces w
    where w.id = $1
      and w.owner_id = (select auth.uid())
  );
$$;

-- The helpers are used by RLS policies. The private schema is not exposed
-- through PostgREST, while authenticated still needs EXECUTE for policy evaluation.
grant usage on schema private to authenticated;
grant execute on function private.is_workspace_member(uuid) to authenticated;
grant execute on function private.is_workspace_owner(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invites enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.anomalies enable row level security;

create policy profiles_self_access on public.profiles
  for all to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy workspaces_member_read on public.workspaces
  for select to authenticated
  using ((select private.is_workspace_member(id)));

create policy workspaces_owner_insert on public.workspaces
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy workspaces_owner_update on public.workspaces
  for update to authenticated
  using ((select private.is_workspace_owner(id)))
  with check ((select private.is_workspace_owner(id)));

create policy workspaces_owner_delete on public.workspaces
  for delete to authenticated
  using ((select private.is_workspace_owner(id)));

create policy workspace_members_member_read on public.workspace_members
  for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));

create policy workspace_members_owner_manage on public.workspace_members
  for all to authenticated
  using ((select private.is_workspace_owner(workspace_id)))
  with check ((select private.is_workspace_owner(workspace_id)) and role = 'member');

create policy workspace_invites_owner_manage on public.workspace_invites
  for all to authenticated
  using ((select private.is_workspace_owner(workspace_id)))
  with check ((select private.is_workspace_owner(workspace_id)));

create policy projects_member_access on public.projects
  for all to authenticated
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));

create policy tasks_member_access on public.tasks
  for all to authenticated
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));

create policy anomalies_member_access on public.anomalies
  for all to authenticated
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));

alter table public.profiles force row level security;
alter table public.workspaces force row level security;
alter table public.workspace_members force row level security;
alter table public.workspace_invites force row level security;
alter table public.projects force row level security;
alter table public.tasks force row level security;
alter table public.anomalies force row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.profiles,
  public.workspaces,
  public.workspace_members,
  public.workspace_invites,
  public.projects,
  public.tasks,
  public.anomalies
to authenticated;
