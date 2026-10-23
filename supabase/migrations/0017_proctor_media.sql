alter table public.sessions
  add column proctor_camera boolean not null default false,
  add column proctor_mic boolean not null default false,
  add column proctor_flag_limit integer check (proctor_flag_limit between 3 and 50);
