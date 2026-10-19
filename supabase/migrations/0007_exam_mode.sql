alter table public.sessions
  add column exam_duration_minutes integer check (exam_duration_minutes between 1 and 300),
  add column results_released_at timestamptz;

create table public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  consent_at timestamptz not null,
  consent_version text not null,
  started_at timestamptz not null,
  deadline_at timestamptz not null,
  submitted_at timestamptz,
  shuffle_seed bigint not null,
  question_order jsonb not null,
  option_orders jsonb not null,
  constraint exam_attempts_session_participant_unique unique (session_id, participant_id)
);
create index exam_attempts_participant_id_idx on public.exam_attempts (participant_id);

create table public.exam_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.exam_attempts (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  chosen_original_index smallint not null check (chosen_original_index between 0 and 3),
  saved_at timestamptz not null default now(),
  constraint exam_answers_attempt_question_unique unique (attempt_id, question_id)
);
create index exam_answers_question_id_idx on public.exam_answers (question_id);

alter table public.proctor_events
  add column attempt_id uuid references public.exam_attempts (id) on delete cascade,
  add column client_at timestamptz,
  add column server_at timestamptz not null default now(),
  add column late boolean not null default false,
  add column detail jsonb not null default '{}'::jsonb;
create index proctor_events_attempt_id_idx on public.proctor_events (attempt_id);
create index proctor_events_session_participant_server_at_idx
  on public.proctor_events (session_id, participant_id, server_at);

create function public.is_attempt_host(target_attempt_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.exam_attempts a
    join public.sessions s on s.id = a.session_id
    join public.quizzes q on q.id = s.quiz_id
    where a.id = target_attempt_id and q.host_id = auth.uid()
  );
$$;

revoke all on function public.is_attempt_host(uuid) from public;
grant execute on function public.is_attempt_host(uuid) to authenticated;

alter table public.exam_attempts enable row level security;
alter table public.exam_answers enable row level security;

create policy exam_attempts_host_select on public.exam_attempts
  for select to authenticated using (public.is_session_host(session_id));
create policy exam_attempts_admin_select on public.exam_attempts
  for select to authenticated using (public.is_admin());
create policy exam_answers_host_select on public.exam_answers
  for select to authenticated using (public.is_attempt_host(attempt_id));
create policy exam_answers_admin_select on public.exam_answers
  for select to authenticated using (public.is_admin());

drop policy proctor_events_student_select_own on public.proctor_events;
create policy proctor_events_admin_select on public.proctor_events
  for select to authenticated using (public.is_admin());

revoke insert, update, delete on public.exam_attempts from anon, authenticated;
revoke insert, update, delete on public.exam_answers from anon, authenticated;
revoke insert, update, delete on public.proctor_events from anon, authenticated;

create function public.reject_non_service_writes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(auth.role(), 'service_role') = 'service_role' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;
  raise exception 'this table can only be written by the server';
end;
$$;

create trigger exam_attempts_server_only
  before insert or update or delete on public.exam_attempts
  for each row execute function public.reject_non_service_writes();
create trigger exam_answers_server_only
  before insert or update or delete on public.exam_answers
  for each row execute function public.reject_non_service_writes();
create trigger proctor_events_server_only
  before insert or update or delete on public.proctor_events
  for each row execute function public.reject_non_service_writes();

create function public.prevent_client_exam_session_writes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(auth.role(), 'service_role') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT'
     and (new.results_released_at is not null or new.exam_duration_minutes is not null) then
    raise exception 'exam columns can only be written by the server';
  end if;

  if tg_op = 'UPDATE'
     and (
       new.results_released_at is distinct from old.results_released_at
       or new.exam_duration_minutes is distinct from old.exam_duration_minutes
     ) then
    raise exception 'exam columns can only be written by the server';
  end if;

  return new;
end;
$$;

create trigger sessions_protect_exam_columns
  before insert or update on public.sessions
  for each row execute function public.prevent_client_exam_session_writes();
