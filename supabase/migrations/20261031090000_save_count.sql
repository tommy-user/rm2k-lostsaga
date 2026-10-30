-- 세이브 출처를 저장 횟수(SaveSystem.save_count)로 확인한다.
-- 게임은 저장할 때마다 이 값을 1 올리므로, 출처는 "같은 run 에서 저장 횟수가 하나 적은 세이브" 다.
-- 새 게임 첫 저장은 저장 횟수가 1 이다.
--
-- 런처는 새 게임을 고른 순간을 알 수 없어서, 첫 저장을 올릴 때 run 을 만든다.
-- 그래서 run 시작 시각은 "이 사용자가 마지막으로 런처를 연 시각" 으로 잡는다.

create table public.sessions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  started_at timestamptz not null
);
alter table public.sessions enable row level security;

-- 런처를 열 때 부른다.
create function public.begin_session()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  insert into public.sessions (user_id, started_at) values (v_user, now())
  on conflict (user_id) do update set started_at = excluded.started_at;
  return now();
end;
$$;
revoke execute on function public.begin_session() from public, anon;
grant execute on function public.begin_session() to authenticated;

create or replace function public.start_run(p_game_version text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_started timestamptz;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if (select count(*) from public.runs
      where user_id = v_user and started_at > now() - interval '1 day') >= 30 then
    raise exception 'too many new games today' using errcode = 'P0001';
  end if;
  select started_at into v_started from public.sessions where user_id = v_user;
  insert into public.runs (user_id, game_version, started_at)
  values (v_user, p_game_version, coalesce(v_started, now()))
  returning id into v_id;
  return v_id;
end;
$$;

alter table public.save_lineage add column save_count integer not null default 0;
alter table public.save_lineage alter column save_count drop default;

drop function public.commit_save(uuid, smallint, bytea, bytea, uuid, bigint, text, bytea, jsonb);

-- 반환: ok | unchanged | bad_run | not_first_save | root_exists | unknown_parent | time_backwards | too_fast
create function public.commit_save(
  p_user uuid,
  p_slot smallint,
  p_hash bytea,
  p_parent bytea,
  p_run uuid,
  p_save_count integer,
  p_frame_count bigint,
  p_game_version text,
  p_delta bytea,
  p_summary jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.runs;
  v_parent public.save_lineage;
  v_cur public.save_slots;
begin
  select * into v_run from public.runs where id = p_run and user_id = p_user;
  if not found then
    return 'bad_run';
  end if;

  -- 같은 세이브를 다시 보낸 경우(재시도)는 계보 검사를 건너뛴다.
  if not exists (select 1 from public.save_lineage where user_id = p_user and hash = p_hash) then
    if p_parent is null then
      if p_save_count <> 1 then
        return 'not_first_save';
      end if;
      if exists (select 1 from public.save_lineage where run_id = p_run and parent_hash is null) then
        return 'root_exists';
      end if;
    else
      select * into v_parent from public.save_lineage
      where user_id = p_user and hash = p_parent and run_id = p_run and save_count = p_save_count - 1;
      if not found then
        return 'unknown_parent';
      end if;
      if p_frame_count < v_parent.frame_count then
        return 'time_backwards';
      end if;
    end if;
    -- 60fps 기준, 10% 와 1분의 여유. 빨리 감기는 웹판에서 끈다.
    if p_frame_count > extract(epoch from now() - v_run.started_at) * 60 * 1.1 + 3600 then
      return 'too_fast';
    end if;
    insert into public.save_lineage (user_id, hash, parent_hash, run_id, slot, save_count, frame_count)
    values (p_user, p_hash, p_parent, p_run, p_slot, p_save_count, p_frame_count);
  end if;

  -- 같은 슬롯에 동시에 올라오는 경우를 줄 세운다.
  perform pg_advisory_xact_lock(hashtextextended(p_user::text || ':' || p_slot, 0));

  delete from public.save_slots
  where user_id = p_user and kind = 'overwritten' and expires_at < now();

  select * into v_cur from public.save_slots
  where user_id = p_user and slot = p_slot and kind = 'current';
  if found then
    if v_cur.hash = p_hash then
      return 'unchanged';
    end if;
    delete from public.save_slots where user_id = p_user and slot = p_slot and kind = 'previous';
    if v_cur.run_id <> p_run then
      -- 다른 플레이(run)의 세이브를 덮어썼다: 최신본만 30일 남긴다.
      update public.save_slots set kind = 'overwritten', expires_at = now() + interval '30 days'
      where id = v_cur.id;
    else
      update public.save_slots set kind = 'previous' where id = v_cur.id;
    end if;
  end if;

  insert into public.save_slots (user_id, slot, kind, hash, run_id, game_version, delta, summary)
  values (p_user, p_slot, 'current', p_hash, p_run, p_game_version, p_delta, p_summary);
  return 'ok';
end;
$$;
revoke execute on function public.commit_save(uuid, smallint, bytea, bytea, uuid, integer, bigint, text, bytea, jsonb)
  from public, anon, authenticated;
grant execute on function public.commit_save(uuid, smallint, bytea, bytea, uuid, integer, bigint, text, bytea, jsonb)
  to service_role;
