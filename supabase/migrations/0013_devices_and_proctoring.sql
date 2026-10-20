alter table public.participants
  add column devices jsonb not null default '[]'::jsonb;

alter table public.sessions
  add column proctored boolean not null default false;

update public.sessions set proctored = true where exam_duration_minutes is not null;
