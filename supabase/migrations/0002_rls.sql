create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create function public.is_quiz_host(target_quiz_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.quizzes
    where id = target_quiz_id and host_id = auth.uid()
  );
$$;

create function public.is_session_host(target_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.sessions s
    join public.quizzes q on q.id = s.quiz_id
    where s.id = target_session_id and q.host_id = auth.uid()
  );
$$;

create function public.is_own_participant(target_participant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.participants
    where id = target_participant_id and user_id = auth.uid()
  );
$$;

create function public.is_problem_host(target_problem_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.coding_problems p
    join public.quizzes q on q.id = p.quiz_id
    where p.id = target_problem_id and q.host_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.is_quiz_host(uuid) from public;
revoke all on function public.is_session_host(uuid) from public;
revoke all on function public.is_own_participant(uuid) from public;
revoke all on function public.is_problem_host(uuid) from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_quiz_host(uuid) to authenticated;
grant execute on function public.is_session_host(uuid) to authenticated;
grant execute on function public.is_own_participant(uuid) to authenticated;
grant execute on function public.is_problem_host(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.quizzes enable row level security;
alter table public.questions enable row level security;
alter table public.sessions enable row level security;
alter table public.participants enable row level security;
alter table public.responses enable row level security;
alter table public.knowledge_states enable row level security;
alter table public.proctor_events enable row level security;
alter table public.risk_reports enable row level security;
alter table public.coding_problems enable row level security;
alter table public.test_cases enable row level security;
alter table public.submissions enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_select_admin on public.profiles
  for select to authenticated using (public.is_admin());
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy quizzes_host_all on public.quizzes
  for all to authenticated
  using (host_id = auth.uid())
  with check (host_id = auth.uid());
create policy quizzes_admin_select on public.quizzes
  for select to authenticated using (public.is_admin());

create policy questions_host_all on public.questions
  for all to authenticated
  using (public.is_quiz_host(quiz_id))
  with check (public.is_quiz_host(quiz_id));
create policy questions_admin_select on public.questions
  for select to authenticated using (public.is_admin());

create policy coding_problems_host_all on public.coding_problems
  for all to authenticated
  using (public.is_quiz_host(quiz_id))
  with check (public.is_quiz_host(quiz_id));
create policy coding_problems_admin_select on public.coding_problems
  for select to authenticated using (public.is_admin());

create policy test_cases_host_all on public.test_cases
  for all to authenticated
  using (public.is_problem_host(problem_id))
  with check (public.is_problem_host(problem_id));
create policy test_cases_admin_select on public.test_cases
  for select to authenticated using (public.is_admin());

create policy sessions_host_all on public.sessions
  for all to authenticated
  using (public.is_quiz_host(quiz_id))
  with check (public.is_quiz_host(quiz_id));

create policy participants_host_select on public.participants
  for select to authenticated using (public.is_session_host(session_id));
create policy participants_student_select_own on public.participants
  for select to authenticated using (user_id = auth.uid());

create policy responses_host_select on public.responses
  for select to authenticated using (public.is_session_host(session_id));
create policy responses_student_select_own on public.responses
  for select to authenticated using (public.is_own_participant(participant_id));

create policy knowledge_states_host_select on public.knowledge_states
  for select to authenticated
  using (
    exists (
      select 1 from public.participants p
      where p.id = participant_id and public.is_session_host(p.session_id)
    )
  );
create policy knowledge_states_student_select_own on public.knowledge_states
  for select to authenticated using (public.is_own_participant(participant_id));

create policy proctor_events_host_select on public.proctor_events
  for select to authenticated using (public.is_session_host(session_id));
create policy proctor_events_student_select_own on public.proctor_events
  for select to authenticated using (public.is_own_participant(participant_id));

create policy submissions_host_select on public.submissions
  for select to authenticated using (public.is_session_host(session_id));
create policy submissions_student_select_own on public.submissions
  for select to authenticated using (public.is_own_participant(participant_id));

create policy risk_reports_host_select on public.risk_reports
  for select to authenticated using (public.is_session_host(session_id));
create policy risk_reports_host_update on public.risk_reports
  for update to authenticated
  using (public.is_session_host(session_id))
  with check (public.is_session_host(session_id));

revoke update on public.risk_reports from authenticated;
grant update (reviewed, reviewer_note) on public.risk_reports to authenticated;

revoke update on public.profiles from authenticated;
grant update (name) on public.profiles to authenticated;
