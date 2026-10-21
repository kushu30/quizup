create table public.student_groups (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index student_groups_host_id_idx on public.student_groups (host_id);
create unique index student_groups_name_idx on public.student_groups (host_id, lower(name));

create table public.student_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.student_groups (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 24),
  email text check (email is null or char_length(email) <= 254),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index student_group_members_name_idx
  on public.student_group_members (group_id, lower(display_name));

alter table public.student_groups enable row level security;
alter table public.student_group_members enable row level security;
revoke all on public.student_groups from anon, authenticated;
revoke all on public.student_group_members from anon, authenticated;

-- Replaces a group's name and members in one transaction.
create function public.save_student_group(
  p_group_id uuid,
  p_host_id uuid,
  p_name text,
  p_members jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_group_id is null then
    insert into student_groups (host_id, name) values (p_host_id, p_name) returning id into v_id;
  else
    update student_groups set name = p_name, updated_at = now()
      where id = p_group_id and host_id = p_host_id returning id into v_id;
    if v_id is null then
      return null;
    end if;
    delete from student_group_members where group_id = v_id;
  end if;
  insert into student_group_members (group_id, display_name, email, position)
    select v_id, m.value ->> 'displayName', nullif(m.value ->> 'email', ''), (m.ordinality - 1)::int
    from jsonb_array_elements(p_members) with ordinality as m(value, ordinality);
  return v_id;
end;
$$;
revoke all on function public.save_student_group(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.save_student_group(uuid, uuid, text, jsonb) to service_role;
