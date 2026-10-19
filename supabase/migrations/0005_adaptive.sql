alter table public.questions alter column elo_rating drop default;

create function public.set_question_elo_from_difficulty()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.elo_rating is null then
    new.elo_rating := case new.difficulty
      when 'easy' then 800
      when 'medium' then 1000
      else 1200
    end;
  end if;
  return new;
end;
$$;

create trigger questions_set_elo_rating
  before insert on public.questions
  for each row execute function public.set_question_elo_from_difficulty();

update public.questions
set elo_rating = case difficulty
  when 'easy' then 800
  when 'medium' then 1000
  else 1200
end;

alter table public.responses
  add column participant_elo_before numeric,
  add column question_elo_before numeric;

create function public.apply_question_rating_delta(
  target_question_id uuid,
  rating_delta double precision
)
returns double precision
language sql
security definer
set search_path = ''
as $$
  update public.questions
  set elo_rating = least(3000, greatest(100, elo_rating + rating_delta))
  where id = target_question_id
  returning elo_rating;
$$;

revoke all on function public.apply_question_rating_delta(uuid, double precision)
  from public, anon, authenticated;
grant execute on function public.apply_question_rating_delta(uuid, double precision)
  to service_role;

revoke insert, update, delete on public.knowledge_states from anon, authenticated;
