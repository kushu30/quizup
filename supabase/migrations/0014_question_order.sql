alter table public.questions add column position integer not null default 0;

-- Keep the order hosts already see: by module, then question text.
update public.questions as target
set position = ranked.position
from (
  select id, row_number() over (partition by quiz_id order by topic, stem, id) as position
  from public.questions
) as ranked
where target.id = ranked.id;

create index questions_quiz_position_idx on public.questions (quiz_id, position);

-- A new question goes to the end of its quiz unless a position is given.
create or replace function public.set_question_position()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.position = 0 then
    select coalesce(max(position), 0) + 1
    into new.position
    from public.questions
    where quiz_id = new.quiz_id;
  end if;
  return new;
end;
$$;

create trigger questions_set_position
before insert on public.questions
for each row execute function public.set_question_position();

-- Puts the listed questions first, in the order given, and keeps every other
-- question of the quiz after them in its existing order. All or nothing.
create or replace function public.reorder_questions(target_quiz_id uuid, ordered_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  listed_count integer;
  matched_count integer;
begin
  listed_count := coalesce(array_length(ordered_ids, 1), 0);
  select count(*) into matched_count
  from public.questions
  where quiz_id = target_quiz_id and id = any (ordered_ids);
  if listed_count = 0 or matched_count <> listed_count
     or listed_count <> (select count(distinct id) from unnest(ordered_ids) as id) then
    raise exception 'question_order_invalid';
  end if;

  update public.questions as target
  set position = placed.position
  from (
    select id, ordinality::integer as position
    from unnest(ordered_ids) with ordinality as listed (id, ordinality)
    union all
    select id, (listed_count + row_number() over (order by position, id))::integer
    from public.questions
    where quiz_id = target_quiz_id and id <> all (ordered_ids)
  ) as placed
  where target.id = placed.id and target.quiz_id = target_quiz_id;

  return listed_count;
end;
$$;

revoke all on function public.reorder_questions(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.reorder_questions(uuid, uuid[]) to service_role;
