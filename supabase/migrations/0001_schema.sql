create type public.user_role as enum ('host', 'student', 'admin');
create type public.quiz_mode as enum ('live', 'exam', 'coding');
create type public.difficulty as enum ('easy', 'medium', 'hard');
create type public.question_source as enum ('manual', 'llm');
create type public.session_status as enum ('lobby', 'running', 'ended');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'student',
  name text,
  email text
);

create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  mode public.quiz_mode not null default 'live',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index quizzes_host_id_idx on public.quizzes (host_id);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  topic text not null,
  stem text not null,
  options jsonb not null,
  correct_index smallint not null,
  difficulty public.difficulty not null default 'medium',
  elo_rating double precision not null default 1000,
  source public.question_source not null default 'manual',
  approved boolean not null default false,
  constraint questions_options_is_array check (jsonb_typeof(options) = 'array'),
  constraint questions_options_has_four check (jsonb_array_length(options) = 4),
  constraint questions_correct_index_in_range check (correct_index between 0 and 3)
);
create index questions_quiz_id_idx on public.questions (quiz_id);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  join_code text not null unique,
  status public.session_status not null default 'lobby',
  started_at timestamptz,
  ended_at timestamptz
);
create index sessions_quiz_id_idx on public.sessions (quiz_id);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  display_name text not null,
  elo double precision not null default 1000,
  joined_at timestamptz not null default now()
);
create index participants_session_id_idx on public.participants (session_id);
create index participants_user_id_idx on public.participants (user_id);

create table public.responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  chosen_index smallint not null check (chosen_index between 0 and 3),
  correct boolean not null,
  response_ms integer not null check (response_ms >= 0),
  served_at timestamptz not null,
  answered_at timestamptz not null default now(),
  constraint responses_participant_question_unique unique (participant_id, question_id)
);
create index responses_session_id_idx on public.responses (session_id);
create index responses_question_id_idx on public.responses (question_id);

create table public.knowledge_states (
  participant_id uuid not null references public.participants (id) on delete cascade,
  topic text not null,
  p_mastery double precision not null check (p_mastery between 0 and 1),
  updated_at timestamptz not null default now(),
  primary key (participant_id, topic)
);

create table public.proctor_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  at timestamptz not null default now(),
  simulated boolean not null default false
);
create index proctor_events_session_id_idx on public.proctor_events (session_id);
create index proctor_events_participant_id_idx on public.proctor_events (participant_id);

create table public.risk_reports (
  session_id uuid not null references public.sessions (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  score double precision not null check (score between 0 and 1),
  flags jsonb not null default '{}'::jsonb,
  reviewed boolean not null default false,
  reviewer_note text,
  primary key (session_id, participant_id)
);
create index risk_reports_participant_id_idx on public.risk_reports (participant_id);

create table public.coding_problems (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  title text not null,
  statement_md text not null default '',
  languages text[] not null default '{}',
  time_limit_ms integer not null default 2000 check (time_limit_ms > 0),
  memory_limit_mb integer not null default 256 check (memory_limit_mb > 0)
);
create index coding_problems_quiz_id_idx on public.coding_problems (quiz_id);

create table public.test_cases (
  id uuid primary key default gen_random_uuid(),
  problem_id uuid not null references public.coding_problems (id) on delete cascade,
  input text not null default '',
  expected_output text not null default '',
  hidden boolean not null default false,
  weight double precision not null default 1 check (weight >= 0)
);
create index test_cases_problem_id_idx on public.test_cases (problem_id);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  problem_id uuid not null references public.coding_problems (id) on delete cascade,
  language text not null,
  source text not null,
  passed integer not null default 0 check (passed >= 0),
  total integer not null default 0 check (total >= 0),
  runtime_ms integer check (runtime_ms >= 0),
  created_at timestamptz not null default now()
);
create index submissions_session_id_idx on public.submissions (session_id);
create index submissions_participant_id_idx on public.submissions (participant_id);
create index submissions_problem_id_idx on public.submissions (problem_id);

create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text := new.raw_user_meta_data ->> 'role';
  assigned_role public.user_role;
begin
  if requested_role = 'host' then
    assigned_role := 'host';
  else
    assigned_role := 'student';
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
