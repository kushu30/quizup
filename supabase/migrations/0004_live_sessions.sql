alter table public.responses add column points integer not null default 0;

alter table public.participants add column rejoin_token_hash text;

alter table public.sessions add column question_ids uuid[] not null default '{}';

create unique index participants_session_display_name_unique
  on public.participants (session_id, lower(display_name));

revoke select on public.participants from anon, authenticated;
grant select (id, session_id, user_id, display_name, elo, joined_at)
  on public.participants to authenticated;
