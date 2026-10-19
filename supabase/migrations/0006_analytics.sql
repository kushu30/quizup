alter table public.sessions
  add column analytics_summary jsonb,
  add column summary_generated_at timestamptz;

create function public.prevent_client_summary_writes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(auth.role(), 'service_role') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT'
     and (new.analytics_summary is not null or new.summary_generated_at is not null) then
    raise exception 'analytics summary can only be written by the server';
  end if;

  if tg_op = 'UPDATE'
     and (
       new.analytics_summary is distinct from old.analytics_summary
       or new.summary_generated_at is distinct from old.summary_generated_at
     ) then
    raise exception 'analytics summary can only be written by the server';
  end if;

  return new;
end;
$$;

create trigger sessions_protect_summary
  before insert or update on public.sessions
  for each row execute function public.prevent_client_summary_writes();
