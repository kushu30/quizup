create table public.session_feedback (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  unique (session_id, participant_id)
);
create index session_feedback_session_id_idx on public.session_feedback (session_id);

alter table public.session_feedback enable row level security;
revoke all on public.session_feedback from anon, authenticated;
