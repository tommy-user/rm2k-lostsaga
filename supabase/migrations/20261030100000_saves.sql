-- 웹판 클라우드 세이브: 새 게임부터 쌓은 세이브만 받는다.
-- 표는 클라이언트에 읽기만 열고, 쓰기는 start_run() 과 Edge Function(upload-save → commit_save) 으로만 한다.
-- 프로젝트는 "새 표 자동 공개" 를 끄고 만들었으므로 GRANT 를 직접 준다.

-- 게임 버전별 기준 세이브. 세이브 본문은 이 파일과의 차이(fossil-delta)로 저장한다.
-- 런처는 Pages(url)에서 받고, Edge Function 은 data 를 쓴다. 둘 다 지우지 않는다.
create table public.base_saves (
  game_version text primary key,
  url text not null,
  sha256 bytea not null check (octet_length(sha256) = 32),
  data bytea not null check (octet_length(data) <= 1048576),
  created_at timestamptz not null default now()
);

-- 새 게임 한 번 = run 하나. 세이브의 플레이 시간은 run 이 시작된 뒤 실제로 흐른 시간을 넘을 수 없다.
create table public.runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  game_version text not null references public.base_saves (game_version),
  started_at timestamptz not null default now()
);
create index runs_user_started on public.runs (user_id, started_at);

-- 받은 모든 세이브의 계보. 슬롯에서 밀려나도 지우지 않는다 (한 줄 약 100바이트).
create table public.save_lineage (
  user_id uuid not null references auth.users (id) on delete cascade,
  hash bytea not null check (octet_length(hash) = 32),       -- 원본 .lsd 의 sha256 (서버가 계산)
  parent_hash bytea check (octet_length(parent_hash) = 32),  -- null = run 의 첫 저장
  run_id uuid not null references public.runs (id) on delete cascade,
  slot smallint not null,
  frame_count bigint not null,
  received_at timestamptz not null default now(),
  primary key (user_id, hash)
);
create unique index save_lineage_one_root on public.save_lineage (run_id) where parent_hash is null;

-- 슬롯별 세이브. current 1개 + previous 1개, 다른 플레이의 세이브를 덮어쓰면 그 세이브는 overwritten 으로 30일.
create table public.save_slots (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  slot smallint not null check (slot between 1 and 99),
  kind text not null check (kind in ('current', 'previous', 'overwritten')),
  hash bytea not null,
  run_id uuid not null references public.runs (id) on delete cascade,
  game_version text not null references public.base_saves (game_version),
  delta bytea not null check (octet_length(delta) <= 262144),  -- gzip(fossil-delta(기준 세이브, 원본))
  summary jsonb not null,  -- {leader_actor, leader_name, level, map_id, frame_count, gold, party}
  saved_at timestamptz not null default now(),
  expires_at timestamptz,
  foreign key (user_id, hash) references public.save_lineage (user_id, hash) on delete cascade,
  check ((kind = 'overwritten') = (expires_at is not null))
);
create unique index save_slots_one_current on public.save_slots (user_id, slot) where kind = 'current';
create unique index save_slots_one_previous on public.save_slots (user_id, slot) where kind = 'previous';
create index save_slots_user on public.save_slots (user_id);

alter table public.base_saves enable row level security;
alter table public.runs enable row level security;
alter table public.save_lineage enable row level security;
alter table public.save_slots enable row level security;

create policy "누구나 기준 세이브 목록을 읽는다" on public.base_saves
  for select to anon, authenticated using (true);
create policy "자기 run 만 읽는다" on public.runs
  for select to authenticated using (user_id = (select auth.uid()));
create policy "자기 세이브만 읽는다" on public.save_slots
  for select to authenticated using (user_id = (select auth.uid()));
-- save_lineage 는 클라이언트에 열지 않는다.

grant select (game_version, url, sha256, created_at) on public.base_saves to anon, authenticated;
grant select on public.runs, public.save_slots to authenticated;

-- 새 게임을 시작할 때 런처가 부른다. 하루 30번까지.
create function public.start_run(p_game_version text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if (select count(*) from public.runs
      where user_id = v_user and started_at > now() - interval '1 day') >= 30 then
    raise exception 'too many new games today' using errcode = 'P0001';
  end if;
  insert into public.runs (user_id, game_version) values (v_user, p_game_version)
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.start_run(text) from public, anon;
grant execute on function public.start_run(text) to authenticated;

-- upload-save Edge Function 이 원본을 복원·해시·요약한 뒤 부른다 (service_role 전용).
-- 반환: ok | unchanged | bad_run | root_exists | unknown_parent | time_backwards | too_fast
create function public.commit_save(
  p_user uuid,
  p_slot smallint,
  p_hash bytea,
  p_parent bytea,
  p_run uuid,
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
      if exists (select 1 from public.save_lineage where run_id = p_run and parent_hash is null) then
        return 'root_exists';
      end if;
    else
      select * into v_parent from public.save_lineage
      where user_id = p_user and hash = p_parent and run_id = p_run;
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
    insert into public.save_lineage (user_id, hash, parent_hash, run_id, slot, frame_count)
    values (p_user, p_hash, p_parent, p_run, p_slot, p_frame_count);
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
revoke execute on function public.commit_save(uuid, smallint, bytea, bytea, uuid, bigint, text, bytea, jsonb)
  from public, anon, authenticated;
grant execute on function public.commit_save(uuid, smallint, bytea, bytea, uuid, bigint, text, bytea, jsonb)
  to service_role;
