create table public.learner_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  elo double precision not null default 1000 check (elo between 100 and 3000),
  topic_mastery jsonb not null default '{}'::jsonb,
  answers_count integer not null default 0 check (answers_count >= 0),
  last_session_id uuid references public.sessions (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index learner_profiles_last_session_id_idx on public.learner_profiles (last_session_id);

alter table public.learner_profiles enable row level security;

create policy learner_profiles_select_own on public.learner_profiles
  for select to authenticated using (user_id = auth.uid());
create policy learner_profiles_delete_own on public.learner_profiles
  for delete to authenticated using (user_id = auth.uid());

revoke all on public.learner_profiles from anon;
revoke insert, update on public.learner_profiles from authenticated;

alter table public.questions
  add column answers_count integer not null default 0 check (answers_count >= 0);

update public.questions q
set answers_count = (
  select count(*)
  from public.responses r
  where r.question_id = q.id and r.question_elo_before is not null
);

create or replace function public.apply_question_rating_delta(
  target_question_id uuid,
  rating_delta double precision
)
returns double precision
language sql
security definer
set search_path = ''
as $$
  update public.questions
  set elo_rating = least(3000, greatest(100, elo_rating + rating_delta)),
      answers_count = answers_count + 1
  where id = target_question_id
  returning elo_rating;
$$;

create function public.apply_learner_profile(
  target_user_id uuid,
  target_session_id uuid,
  new_elo double precision,
  new_topic_mastery jsonb,
  answers_added integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  applied integer;
begin
  insert into public.learner_profiles (
    user_id, elo, topic_mastery, answers_count, last_session_id, updated_at
  )
  values (
    target_user_id,
    least(3000, greatest(100, new_elo)),
    new_topic_mastery,
    answers_added,
    target_session_id,
    now()
  )
  on conflict (user_id) do update set
    elo = excluded.elo,
    topic_mastery = public.learner_profiles.topic_mastery || excluded.topic_mastery,
    answers_count = public.learner_profiles.answers_count + excluded.answers_count,
    last_session_id = excluded.last_session_id,
    updated_at = now()
  where public.learner_profiles.last_session_id is distinct from excluded.last_session_id;
  get diagnostics applied = row_count;
  return applied > 0;
end;
$$;

revoke all on function public.apply_learner_profile(uuid, uuid, double precision, jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.apply_learner_profile(uuid, uuid, double precision, jsonb, integer)
  to service_role;
