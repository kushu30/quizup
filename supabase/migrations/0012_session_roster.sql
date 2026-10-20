create table public.session_roster (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 24),
  email text check (email is null or char_length(email) <= 254),
  token_hash text not null,
  participant_id uuid references public.participants (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index session_roster_name_idx on public.session_roster (session_id, lower(display_name));
create unique index session_roster_token_idx on public.session_roster (session_id, token_hash);

alter table public.session_roster enable row level security;
revoke all on public.session_roster from anon, authenticated;
