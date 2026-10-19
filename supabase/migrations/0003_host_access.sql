create table public.host_allowlist (
  email text primary key check (email = lower(email)),
  granted_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index host_allowlist_granted_by_idx on public.host_allowlist (granted_by);

alter table public.host_allowlist enable row level security;

revoke all on public.host_allowlist from anon;

create policy host_allowlist_admin_all on public.host_allowlist
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  assigned_role public.user_role := 'student';
begin
  if new.email_confirmed_at is not null
     and exists (select 1 from public.host_allowlist where email = lower(new.email)) then
    assigned_role := 'host';
  end if;

  insert into public.profiles (id, role, name, email)
  values (
    new.id,
    assigned_role,
    nullif(new.raw_user_meta_data ->> 'name', ''),
    new.email
  );
  return new;
end;
$$;

create function public.promote_profiles_for_allowlisted_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles p
  set role = 'host'
  from auth.users u
  where u.id = p.id
    and lower(p.email) = new.email
    and p.role = 'student'
    and u.email_confirmed_at is not null;
  return new;
end;
$$;

create trigger on_host_allowlist_insert
  after insert on public.host_allowlist
  for each row execute function public.promote_profiles_for_allowlisted_email();

create function public.demote_profiles_for_removed_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set role = 'student'
  where lower(email) = old.email and role = 'host';
  return old;
end;
$$;

create trigger on_host_allowlist_delete
  after delete on public.host_allowlist
  for each row execute function public.demote_profiles_for_removed_email();

create function public.promote_profile_on_email_confirmation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.host_allowlist where email = lower(new.email)) then
    update public.profiles
    set role = 'host'
    where id = new.id and role = 'student';
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.promote_profile_on_email_confirmation();

update public.profiles
set role = 'student'
where role = 'host'
  and lower(email) not in (select email from public.host_allowlist);

revoke all on function public.promote_profiles_for_allowlisted_email() from public;
revoke all on function public.demote_profiles_for_removed_email() from public;
revoke all on function public.promote_profile_on_email_confirmation() from public;

revoke update on public.profiles from authenticated, anon;
grant update (name) on public.profiles to authenticated;
revoke insert, delete on public.profiles from authenticated, anon;
